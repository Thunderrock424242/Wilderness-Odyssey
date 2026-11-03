import type { Attachment, Message } from 'discord.js';
import { z } from 'zod';
import * as s from '../contracts/v1/playtester-chat';
import { redactLog } from '../services/logParser';
import { ConnectedStore, ServiceError, type Actor } from './store';
import { PlaytesterChatStore, type ChatFile } from './playtesterChatStore';

export const CHAT_GUIDE = 'Your playtest messages and attached diagnostics are shared privately with the owner-selected admin team on the website and kept for up to 90 days. Use `chat CAMPAIGN_ID` to choose a playtest, `chat off` to stop forwarding, `chat start` to resume, and `updates off` or `updates on` for update DMs. Joining the Discord community is recommended, but optional.';
type Access = {owner:boolean;userId:string};
type Sender = (user:string,body:string,verify:() => Promise<void>) => Promise<void>;
export class PlaytesterChat {
  readonly data:PlaytesterChatStore;
  private busy = false;
  private stopped = false;
  private reservedBytes = 0;
  private readonly users = new Set<string>();
  constructor(store:ConnectedStore,readonly access:(actor:Actor,dispatch?:boolean) => Promise<Access>,readonly checkAdmin:(user:string) => Promise<void>,readonly send:Sender,readonly communityUrl:string,readonly fetcher:typeof fetch = fetch) { this.data = new PlaytesterChatStore(store); }
  async authorize(actor:Actor,dispatch = false):Promise<Access> {
    const value = await this.access(actor,dispatch);
    if (!value.owner && !this.data.approved(value.userId)) throw new ServiceError(403,'CHAT_DENIED','The owner must approve your administrator account for the playtester inbox.');
    return value;
  }
  async handle(actor:Actor,method:string,path:string,body:unknown,query:Record<string,string>,key:string):Promise<unknown> {
    const access = await this.authorize(actor),route = s.chatRoutes.find(item => item.method === method && item.pattern.test(path));
    if (!route) throw new ServiceError(404,'CHAT_ROUTE','Inbox route not found.');
    (route.query ?? z.object({}).strict()).parse(query);
    const input = route.input?.parse(body),parts = path.split('/').filter(Boolean);
    let result:unknown;
    if (parts.length === 1) result = this.data.home(access.owner,query.cursor);
    else if (parts[1] === 'access') {
      if (!access.owner) throw new ServiceError(403,'OWNER_REQUIRED','Only the Discord server owner can choose inbox administrators.');
      const value = s.chatAccessInput.parse(input);
      if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) throw new ServiceError(400,'CHAT_REQUEST','A request identifier is required.');
      if (value.approved) await this.checkAdmin(value.userId);
      if (!(await this.authorize(actor)).owner) throw new ServiceError(403,'OWNER_REQUIRED','Only the current Discord server owner can choose inbox administrators.');
      result = this.data.approveOnce(actor,value.userId,value.approved,key);
    } else if (parts[1] === 'threads') result = method === 'GET' ? this.data.thread(parts[2],parts[3],query.before) : this.data.reply(actor,parts[2],parts[3],s.chatReplyInput.parse(input).body,key);
    else if (parts[1] === 'broadcasts') result = method === 'GET' ? this.data.delivery(parts[2]) : this.data.broadcast(actor,s.chatBroadcastInput.parse(input).campaignId,s.chatBroadcastInput.parse(input).body,key);
    return route.output.parse(result);
  }
  async attachment(actor:Actor,id:string) { await this.authorize(actor); return this.data.file(id); }
  async receive(message:Message):Promise<boolean> {
    if (message.guildId || message.author.bot) return false;
    const user = message.author.id,campaigns = this.data.campaigns(user);
    if (!campaigns.length) return true;
    const command = message.content.trim();
    // Stop commands must take effect even while an earlier upload is still in flight.
    if (/^chat off$/i.test(command)) { this.data.setEnabled(user,false);await this.notice(message,'Chat forwarding stopped. Use `chat start` to resume; `updates off` also stops campaign updates.');return true; }
    if (/^updates (on|off)$/i.test(command)) { this.data.setUpdates(user,/on$/i.test(command));await this.notice(message,/on$/i.test(command) ? 'Campaign update DMs enabled.':'Campaign update DMs stopped.');return true; }
    if (this.users.has(user) || this.users.size >= 100) { await this.notice(message,'Please wait for your previous message to finish saving.'); return true; }
    this.users.add(user);
    let reservation = 0;
    try {
      const text = message.content.trim();
      if (/^chat start$/i.test(text)) { this.data.setEnabled(user,true); await this.notice(message,CHAT_GUIDE + '\nAvailable playtests: ' + campaigns.join(', ')); return true; }
      const selection = /^chat ([A-Za-z0-9_-]{1,100})$/i.exec(text);
      if (selection) { this.data.select(user,selection[1]); await this.notice(message,'Selected playtest: ' + selection[1] + '\n' + CHAT_GUIDE); return true; }
      const campaign = this.data.route(user);
      if (!campaign) { await this.notice(message,'Choose a playtest with `chat CAMPAIGN_ID`, or use `chat start` to resume. Available: ' + campaigns.join(', ') + '\n' + CHAT_GUIDE); return true; }
      if (this.data.store.db.prepare('SELECT 1 FROM cs_chat_messages WHERE source_id=?').get(message.id)) return true;
      const recent = this.data.store.db.prepare("SELECT count(*) AS n FROM cs_chat_messages WHERE user_id=? AND direction='tester' AND created_at>?").get(user,this.data.store.clock()-60000) as {n:number};
      if (recent.n >= 20) throw new ServiceError(429,'CHAT_RATE','Please wait before sending more messages.');
      if (text.length > 4000 || message.attachments.size > 3) throw new ServiceError(413,'CHAT_SIZE','Use up to 4,000 characters and three diagnostic attachments.');
      const attachments = [...message.attachments.values()];
      const declared = attachments.reduce((n,file) => n+file.size,0);
      if (declared > 10*1024*1024) throw new ServiceError(413,'CHAT_SIZE','Use up to 10 MiB of diagnostics per message.');
      this.data.assertCapacity(1,declared);
      const budget = Math.min(10*1024*1024,attachments.reduce((n,file) => n+(/\.sparkprofile$/i.test(file.name) ? 5*1024*1024:512*1024),0));
      if (this.reservedBytes+budget > 20*1024*1024) throw new ServiceError(429,'CHAT_BUSY','Other diagnostics are being saved. Please try again shortly.');
      reservation=budget;this.reservedBytes+=reservation;
      const files:ChatFile[] = [];let received=0;
      for (const attachment of attachments) {const file=await this.readAttachment(attachment,10*1024*1024-received);received+=file.bytes.length;files.push(file);}
      if (!text && !files.length) { await this.notice(message,'Send text, a Spark viewer link, a .txt/.log/.json diagnostic or a .sparkprofile file.'); return true; }
      const saved = this.data.receive(user,campaign,message.id,redactLog(text),files);
      if (saved) await this.notice(message,'Saved privately to the ' + campaign + ' playtest inbox for the chosen admin team. ' + (files.length ? 'Text logs are redacted automatically; check them for any remaining private information. ':'') + 'Use `chat off` to stop forwarding.');
    } catch (error) {
      await this.notice(message,error instanceof ServiceError ? error.message:'Your message could not be saved. Please try again later.');
    } finally { this.reservedBytes-=reservation;this.users.delete(user); }
    return true;
  }
  private async notice(message:Message,body:string):Promise<void> {
    try { await this.deadline(message.reply({content:body.slice(0,2000),allowedMentions:{parse:[],repliedUser:false}})); }
    catch { /* A failed acknowledgement must not cause duplicate storage or reveal diagnostics. */ }
  }
  private async readAttachment(attachment:Attachment,remaining:number):Promise<ChatFile> {
    const extension = /\.(txt|log|json|sparkprofile)$/i.exec(attachment.name)?.[1]?.toLowerCase();
    const maximum = Math.min(remaining,extension === 'sparkprofile' ? 5*1024*1024:512*1024);
    const invalid = () => new ServiceError(422,'CHAT_FILE','Use Discord-hosted .txt/.log/.json files up to 512 KiB or .sparkprofile files up to 5 MiB.');
    let url:URL;
    try { url = new URL(attachment.url); } catch { throw invalid(); }
    if (!extension || !attachment.size || attachment.size > maximum || attachment.name.length > 160 || /[\\/\u0000-\u001f]/.test(attachment.name) || url.protocol !== 'https:' || !['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname) || url.username || url.password || url.port) throw invalid();
    const response = await this.fetcher(url,{redirect:'error',signal:AbortSignal.timeout(8000)});
    if (!response.ok || !response.body || Number(response.headers.get('content-length') ?? 0) > maximum) { await response.body?.cancel(); throw invalid(); }
    const reader = response.body.getReader(),chunks:Buffer[] = []; let total = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; total += part.value.length; if (total > maximum) throw invalid(); chunks.push(Buffer.from(part.value)); }
    } finally { await reader.cancel().catch(() => undefined); }
    let bytes = Buffer.concat(chunks);
    if (!bytes.length) throw invalid();
    if (extension !== 'sparkprofile') {
      if (bytes.includes(0)) throw invalid();
      let decoded:string;
      try { decoded = new TextDecoder('utf-8',{fatal:true}).decode(bytes); } catch { throw invalid(); }
      bytes = Buffer.from(redactLog(decoded));
      if (bytes.length > maximum) throw invalid();
    }
    return {name:attachment.name,kind:extension === 'sparkprofile' ? 'spark':'text',bytes};
  }
  private async deadline<T>(work:Promise<T>):Promise<T> {
    let timer!:NodeJS.Timeout;
    try { return await Promise.race([work,new Promise<never>((_resolve,reject) => {timer = setTimeout(() => reject(new ServiceError(503,'CHAT_TIMEOUT','Discord delivery could not be confirmed.')),5000);})]); }
    finally {clearTimeout(timer);}
  }
  stop():void { this.stopped = true; }
  async deliver():Promise<void> {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      for (const row of this.data.pending()) {
        let dispatched = false;
        try {
          const actor = JSON.parse(row.actor ?? 'null') as Actor|null;
          if (!actor || this.data.store.clock()-row.created_at > (row.direction === 'update' ? 86400000:10*60000)) throw new ServiceError(403,'CHAT_EXPIRED','Delivery expired.');
          const verify = async () => {
            if (this.stopped) throw new ServiceError(403,'CHAT_STOPPED','Delivery stopped.');
            await this.authorize(actor,true);
            if (this.stopped || !this.data.eligible(row.user_id,row.campaign_id,row.direction === 'update')) throw new ServiceError(403,'CHAT_DENIED','The tester is no longer available.');
          };
          await verify();
          const suffix = row.direction === 'update' ? '\n\nJoining our Discord community is recommended, but optional: ' + this.communityUrl + '\nUse `updates off` to stop update DMs.':'\n\nUse `chat CAMPAIGN_ID` to select a playtest before replying. `chat off` stops forwarding.';
          await this.send(row.user_id,'[' + row.campaign_id + '] ' + row.body + suffix,async () => {await verify();this.data.status(row.id,'sending');dispatched = true;});
          this.data.status(row.id,'sent');
        } catch (error) {
          this.data.status(row.id,dispatched ? (error instanceof ServiceError && error.code === 'CHAT_DELIVERY_FAILED' ? 'failed':'unknown') : error instanceof ServiceError && [401,403].includes(error.status) ? 'cancelled':'failed');
        }
      }
    } finally {this.busy = false;}
  }
}
