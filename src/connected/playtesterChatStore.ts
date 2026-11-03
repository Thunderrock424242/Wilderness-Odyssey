import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { discordIdSchema } from '../contracts/v1/auth';
import * as s from '../contracts/v1/playtester-chat';
import { ConnectedStore, ServiceError, type Actor } from './store';

export type ChatFile = { name:string;kind:'text'|'spark';bytes:Buffer };
type Row = {id:number;campaign_id:string;user_id:string;author_id:string|null;body:string;direction:'tester'|'staff'|'update';status:string;created_at:number;actor:string|null;broadcast_id:string|null};
export class PlaytesterChatStore {
  constructor(readonly store:ConnectedStore) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS cs_chat_admins(user_id TEXT PRIMARY KEY,approved_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_chat_preferences(user_id TEXT PRIMARY KEY,campaign_id TEXT,enabled INTEGER NOT NULL DEFAULT 1,updates INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS cs_chat_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,campaign_id TEXT NOT NULL,user_id TEXT NOT NULL,source_id TEXT UNIQUE,author_id TEXT,body TEXT NOT NULL,direction TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,actor TEXT,broadcast_id TEXT);
      CREATE INDEX IF NOT EXISTS cs_chat_thread ON cs_chat_messages(campaign_id,user_id,id);
      CREATE TABLE IF NOT EXISTS cs_chat_files(id TEXT PRIMARY KEY,message_id INTEGER NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL,bytes BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS cs_chat_receipts(actor TEXT,action TEXT,key TEXT,hash TEXT,result TEXT,created_at INTEGER,PRIMARY KEY(actor,action,key));
    `);
    // A process interruption leaves delivery unconfirmed; never replay a possibly sent DM.
    store.db.prepare("UPDATE cs_chat_messages SET status='unknown' WHERE status='sending'").run();
  }
  campaigns(userId:string):string[] {
    discordIdSchema.parse(userId);
    const rows = this.store.db.prepare(`SELECT DISTINCT campaign_id FROM (
      SELECT campaign_id FROM cs_participant_memberships WHERE user_id=? AND active=1
      UNION SELECT campaign_id FROM cs_participant_invites WHERE user_id=? AND revoked=0 AND claimed_at IS NULL AND expires_at>?
    ) WHERE campaign_id IN (SELECT id FROM cs_records WHERE kind='pt_campaign') LIMIT 101`).all(userId,userId,this.store.clock()) as {campaign_id:string}[];
    if (rows.length > 100) throw new ServiceError(429,'CHAT_LIMIT','Too many active playtests. Ask the owner for help.');
    return rows.map(row => row.campaign_id);
  }
  preferences(user:string) { return this.store.db.prepare('SELECT * FROM cs_chat_preferences WHERE user_id=?').get(user) as {campaign_id:string|null;enabled:number;updates:number}|undefined; }
  route(user:string):string|null {
    const campaigns = this.campaigns(user),preferences = this.preferences(user);
    if (preferences?.enabled === 0) return null;
    if (preferences?.campaign_id && campaigns.includes(preferences.campaign_id)) return preferences.campaign_id;
    return campaigns.length === 1 ? campaigns[0] : null;
  }
  select(user:string,campaign:string):void {
    if (!this.campaigns(user).includes(campaign)) throw new ServiceError(403,'CHAT_DENIED','This playtest is not available to your account.');
    this.store.db.prepare('INSERT INTO cs_chat_preferences(user_id,campaign_id) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET campaign_id=excluded.campaign_id,enabled=1').run(user,campaign);
  }
  setEnabled(user:string,enabled:boolean):void { discordIdSchema.parse(user); this.store.db.prepare('INSERT INTO cs_chat_preferences(user_id,enabled) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled').run(user,Number(enabled)); }
  setUpdates(user:string,enabled:boolean):void { discordIdSchema.parse(user); this.store.db.prepare('INSERT INTO cs_chat_preferences(user_id,updates) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET updates=excluded.updates').run(user,Number(enabled)); }
  eligible(user:string,campaign:string,updates = false):boolean { return this.campaigns(user).includes(campaign) && (updates ? this.preferences(user)?.updates !== 0 : this.preferences(user)?.enabled !== 0); }
  approved(user:string):boolean { return !!this.store.db.prepare('SELECT 1 FROM cs_chat_admins WHERE user_id=?').get(user); }
  approve(user:string,value:boolean,owner:string):void {
    discordIdSchema.parse(user);
    if (value) {
      const count = this.store.db.prepare('SELECT count(*) AS n FROM cs_chat_admins').get() as {n:number};
      if (count.n >= 100 && !this.approved(user)) throw new ServiceError(429,'CHAT_LIMIT','The administrator approval limit has been reached.');
      this.store.db.prepare('INSERT OR IGNORE INTO cs_chat_admins VALUES (?,?)').run(user,this.store.now());
    } else this.store.db.prepare('DELETE FROM cs_chat_admins WHERE user_id=?').run(user);
    this.store.audit(owner,'chat.admin',user,value ? 'approved':'revoked');
  }
  approveOnce(actor:Actor,user:string,value:boolean,key:string) {
    return this.once(actor,'approval:'+user,key,{approved:value},() => {this.approve(user,value,actor.id);return {schemaVersion:'1.0',saved:true};});
  }
  assertCapacity(extra:number,bytes:number):void { this.quota(extra,bytes); }
  home(owner:boolean,cursor = '0') {
    const offset = this.cursor(cursor);
    const rows = this.store.db.prepare('SELECT campaign_id,user_id,max(created_at) AS latest FROM cs_chat_messages GROUP BY campaign_id,user_id ORDER BY latest DESC,campaign_id,user_id LIMIT 51 OFFSET ?').all(offset) as {campaign_id:string;user_id:string;latest:number}[];
    const admins = owner ? this.store.db.prepare('SELECT user_id,approved_at FROM cs_chat_admins ORDER BY user_id').all() as {user_id:string;approved_at:string}[] : [];
    const campaigns = this.store.db.prepare("SELECT id,json_extract(data,'$.title') AS title FROM cs_records WHERE kind='pt_campaign' ORDER BY id LIMIT 100").all();
    return s.chatHomeSchema.parse({schemaVersion:'1.0',owner,admins:admins.map(row => ({userId:row.user_id,approvedAt:row.approved_at})),campaigns,threads:rows.slice(0,50).map(row => ({campaignId:row.campaign_id,userId:row.user_id,lastMessageAt:new Date(row.latest).toISOString()})),nextCursor:rows.length > 50 ? String(offset+50):null});
  }
  thread(campaign:string,user:string,before?:string) {
    discordIdSchema.parse(user);
    const rows = this.store.db.prepare('SELECT * FROM cs_chat_messages WHERE campaign_id=? AND user_id=? AND id<? ORDER BY id DESC LIMIT 51').all(campaign,user,before ? this.cursor(before):Number.MAX_SAFE_INTEGER) as Row[];
    return s.chatThreadSchema.parse({schemaVersion:'1.0',messages:rows.slice(0,50).reverse().map(row => this.message(row.id)),nextCursor:rows.length > 50 ? String(rows[49].id):null});
  }
  message(id:number) {
    const row = this.store.db.prepare('SELECT * FROM cs_chat_messages WHERE id=?').get(id) as Row|undefined;
    if (!row) throw new ServiceError(404,'CHAT_MISSING','Message not found.');
    const files = this.store.db.prepare('SELECT id,name,kind,length(bytes) AS size FROM cs_chat_files WHERE message_id=?').all(id);
    return s.chatMessageSchema.parse({id:String(id),campaignId:row.campaign_id,userId:row.user_id,authorId:row.author_id,body:row.body,direction:row.direction,status:row.status,createdAt:new Date(row.created_at).toISOString(),attachments:files});
  }
  receive(user:string,campaign:string,source:string,body:string,files:ChatFile[]):boolean {
    if (!this.eligible(user,campaign)) throw new ServiceError(403,'CHAT_DENIED','This playtest conversation is unavailable.');
    if (this.store.db.prepare('SELECT 1 FROM cs_chat_messages WHERE source_id=?').get(source)) return false;
    if (body.length > 4000 || files.length > 3 || files.some(file => !file.bytes.length || file.bytes.length > 5*1024*1024 || file.name.length > 160 || /[\\/\u0000-\u001f]/.test(file.name)) || files.reduce((n,file) => n+file.bytes.length,0) > 10*1024*1024) throw new ServiceError(413,'CHAT_SIZE','Message or attachments are too large.');
    const count = this.store.db.prepare("SELECT count(*) AS n FROM cs_chat_messages WHERE user_id=? AND direction='tester' AND created_at>?").get(user,this.store.clock()-60000) as {n:number};
    if (count.n >= 20) throw new ServiceError(429,'CHAT_RATE','Please wait before sending more messages.');
    return this.store.transaction(() => {
      this.quota(1,files.reduce((n,file) => n+file.bytes.length,0));
      const row = this.store.db.prepare("INSERT INTO cs_chat_messages(campaign_id,user_id,source_id,body,direction,status,created_at) VALUES (?,?,?,?,'tester','received',?)").run(campaign,user,source,body,this.store.clock());
      for (const file of files) this.store.db.prepare('INSERT INTO cs_chat_files VALUES (?,?,?,?,?)').run(randomUUID(),row.lastInsertRowid,file.name,file.kind,file.bytes);
      return true;
    });
  }
  reply(actor:Actor,campaign:string,user:string,body:string,key:string) {
    s.chatReplyInput.parse({body});
    return this.once(actor,'reply:' + campaign + ':' + user,key,{body},() => {
      if (!this.eligible(user,campaign)) throw new ServiceError(403,'CHAT_DENIED','This tester is no longer available for chat.');
      this.quota(1,0);
      return s.chatReplySchema.parse({schemaVersion:'1.0',message:this.message(this.queue(actor,campaign,user,body,'staff',null))});
    });
  }
  broadcast(actor:Actor,campaign:string,body:string,key:string) {
    s.chatBroadcastInput.parse({campaignId:campaign,body});
    if (!this.store.record('pt_campaign',campaign)) throw new ServiceError(404,'CHAT_MISSING','Playtest not found.');
    return this.once(actor,'broadcast:' + campaign,key,{body},() => {
      const users = this.store.db.prepare(`SELECT DISTINCT user_id FROM (
        SELECT user_id FROM cs_participant_memberships WHERE campaign_id=? AND active=1
        UNION SELECT user_id FROM cs_participant_invites WHERE campaign_id=? AND revoked=0 AND claimed_at IS NULL AND expires_at>?
      ) WHERE user_id NOT IN (SELECT user_id FROM cs_chat_preferences WHERE updates=0) LIMIT 1001`).all(campaign,campaign,this.store.clock()) as {user_id:string}[];
      if (users.length > 1000) throw new ServiceError(429,'CHAT_LIMIT','The campaign recipient limit has been reached.');
      this.quota(users.length,0);
      const id = randomUUID();
      this.store.put('chat_broadcast',id,actor.id,{createdAt:this.store.now(),campaignId:campaign});
      for (const user of users) this.queue(actor,campaign,user.user_id,body,'update',id);
      return s.chatBroadcastSchema.parse({schemaVersion:'1.0',broadcastId:id,recipients:users.length});
    });
  }
  delivery(id:string) {
    if (!this.store.record('chat_broadcast',id)) throw new ServiceError(404,'CHAT_MISSING','Update not found.');
    const counts = {queued:0,sending:0,sent:0,failed:0,unknown:0,cancelled:0};
    const rows = this.store.db.prepare('SELECT status,count(*) AS n FROM cs_chat_messages WHERE broadcast_id=? GROUP BY status').all(id) as {status:keyof typeof counts;n:number}[];
    for (const row of rows) counts[row.status] = row.n;
    return s.chatDeliverySchema.parse({schemaVersion:'1.0',broadcastId:id,counts});
  }
  pending():Row[] { return this.store.db.prepare("SELECT * FROM cs_chat_messages WHERE status='queued' ORDER BY id LIMIT 2").all() as Row[]; }
  status(id:number,value:string):void { this.store.db.prepare('UPDATE cs_chat_messages SET status=? WHERE id=?').run(value,id); }
  file(id:string) {
    const row = this.store.db.prepare('SELECT name,kind,bytes FROM cs_chat_files WHERE id=?').get(z.uuid().parse(id)) as {name:string;kind:string;bytes:Uint8Array}|undefined;
    if (!row) throw new ServiceError(404,'CHAT_MISSING','Attachment not found.'); return row;
  }
  cleanup():void {
    this.store.transaction(() => {
      const cutoff = this.store.clock()-90*86400000;
      this.store.db.prepare('DELETE FROM cs_chat_files WHERE message_id IN (SELECT id FROM cs_chat_messages WHERE created_at<?)').run(cutoff);
      this.store.db.prepare('DELETE FROM cs_chat_messages WHERE created_at<?').run(cutoff);
      this.store.db.prepare('DELETE FROM cs_chat_receipts WHERE created_at<?').run(this.store.clock()-86400000);
      this.store.db.prepare("DELETE FROM cs_records WHERE kind='chat_broadcast' AND json_extract(data,'$.createdAt')<?").run(new Date(cutoff).toISOString());
    });
  }
  private cursor(value:string):number { if (!/^\d{1,16}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new ServiceError(400,'CHAT_CURSOR','Invalid page cursor.'); return Number(value); }
  private quota(extra:number,bytes:number):void {
    const count = this.store.db.prepare('SELECT count(*) AS n FROM cs_chat_messages').get() as {n:number};
    const size = this.store.db.prepare('SELECT coalesce(sum(length(bytes)),0) AS n FROM cs_chat_files').get() as {n:number};
    if (count.n+extra > 10000 || size.n+bytes > 100*1024*1024) throw new ServiceError(429,'CHAT_QUOTA','The private inbox storage limit has been reached. Ask the owner for help.');
  }
  private queue(actor:Actor,campaign:string,user:string,body:string,direction:string,broadcast:string|null):number {
    return Number(this.store.db.prepare("INSERT INTO cs_chat_messages(campaign_id,user_id,author_id,body,direction,status,created_at,actor,broadcast_id) VALUES (?,?,?,?,?,'queued',?,?,?)").run(campaign,user,actor.subject ?? null,body,direction,this.store.clock(),JSON.stringify(actor),broadcast).lastInsertRowid);
  }
  private once<T>(actor:Actor,action:string,key:string,input:unknown,work:() => T):T {
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) throw new ServiceError(400,'CHAT_REQUEST','A request identifier is required.');
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.store.transaction(() => {
      this.store.db.prepare('DELETE FROM cs_chat_receipts WHERE created_at<?').run(this.store.clock()-86400000);
      const old = this.store.db.prepare('SELECT hash,result FROM cs_chat_receipts WHERE actor=? AND action=? AND key=?').get(actor.id,action,key) as {hash:string;result:string}|undefined;
      if (old) { if (old.hash !== hash) throw new ServiceError(409,'CHAT_CONFLICT','This request identifier was already used.'); return JSON.parse(old.result) as T; }
      const count = this.store.db.prepare('SELECT count(*) AS n FROM cs_chat_receipts').get() as {n:number};
      if (count.n >= 10000) throw new ServiceError(429,'CHAT_QUOTA','The request storage limit has been reached.');
      const result = work();
      this.store.db.prepare('INSERT INTO cs_chat_receipts VALUES (?,?,?,?,?,?)').run(actor.id,action,key,hash,JSON.stringify(result),this.store.clock());
      this.store.audit(actor.id,'chat.request',action,'queued'); return result;
    });
  }
}
