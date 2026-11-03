import { DiscordAPIError, Routes, type Client, type User } from 'discord.js';
import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { AetherRequest } from '../aether/types';
import { ConnectedStore, ServiceError, authorize, type Actor } from './store';
import { IdentityService } from './identity';
import { loadConnectedConfig, type ConnectedConfig } from './config';
import { ServiceMonitor } from './monitor';
import { ModerationService } from './moderation';
import { AdminService } from './admin';
import { MainServerClient } from './mainClient';
import { ConnectedHttp } from './http';
import { DashboardAuth, DASHBOARD_ISSUER } from './dashboardAuth';
import { requireDiscordAdministrator } from './discordPermissions';
import { ParticipantService } from './participant';
import { participantInviteInput, participantInviteSchema } from '../contracts/v1/participants';
import type { Capability } from '../contracts/v1/admin';
import { ContentPublishing } from './contentPublishing';
import { GitHubContentRepository } from './contentRepository';
import { PlaytesterChat, CHAT_GUIDE } from './playtesterChat';
import { configurationView } from './configurationView';
import { AetherGatewayClient } from './aetherGatewayClient';
import { AetherPlayground } from './aetherPlayground';
async function boundedDiscord<T>(work: Promise<T>): Promise<T> {
  let timer!: NodeJS.Timeout;
  const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new ServiceError(503, 'DISCORD_TIMEOUT', 'Discord delivery could not be confirmed.')), 3000); });
  try { return await Promise.race([work, timeout]); } finally { clearTimeout(timer); }
}
export class ConnectedRuntime {
  readonly store: ConnectedStore;
  readonly identity: IdentityService;
  readonly monitor: ServiceMonitor;
  readonly moderation: ModerationService;
  readonly admin: AdminService;
  readonly http: ConnectedHttp;
  readonly main: MainServerClient;
  readonly playground:AetherPlayground;
  readonly dashboard?: DashboardAuth;
  readonly participant?: ParticipantService;
  readonly publishing?:ContentPublishing;
  readonly chat?:PlaytesterChat;
  private client?: Client;
  private readonly timers = new Set<NodeJS.Timeout>();
  private stopped = false;
  private started = false;
  constructor(db: DatabaseSync, readonly config: ConnectedConfig) {
    this.store = new ConnectedStore(db);
    this.identity = new IdentityService(this.store, config.serverId);
    this.monitor = new ServiceMonitor(this.store, config.serverId, Date.now, config.failures, config.recoveries, config.staleSeconds);
    this.moderation = new ModerationService(this.store, this.identity);
    if (config.discord) this.participant = new ParticipantService(this.store, config.discord);
    if (config.discord) this.dashboard = new DashboardAuth(this.store, config.discord, async (guildId, userId) => {
      if (!this.client?.isReady()) throw new ServiceError(503, 'DISCORD_UNAVAILABLE', 'Discord permissions could not be verified. Try again later.');
      await requireDiscordAdministrator(this.client.rest, guildId, userId);
    });
    if (config.discord && config.staffAuthMode === 'discord') this.chat = new PlaytesterChat(this.store,async (actor,dispatch) => {
      if (actor.issuer !== DASHBOARD_ISSUER || !actor.subject) throw new ServiceError(403,'CHAT_DENIED','Use an enrolled Discord administrator account.');
      if (!this.client?.isReady()) throw new ServiceError(503,'DISCORD_UNAVAILABLE','Discord is unavailable.');
      const guild = z.object({id:z.literal(config.discord!.guildId),owner_id:z.string().regex(/^\d{17,22}$/)}).parse(await boundedDiscord(this.client.rest.get(Routes.guild(config.discord!.guildId))));
      if (dispatch) await this.dashboard!.authorizeMember(actor.subject);
      else await this.authorizeStaff(actor,'server:write');
      return {owner:guild.owner_id === actor.subject,userId:actor.subject};
    },async user => {
      if (!this.client?.isReady()) throw new ServiceError(503,'DISCORD_UNAVAILABLE','Discord is unavailable.');
      await requireDiscordAdministrator(this.client.rest,config.discord!.guildId,user);
    },async (user,body,verify) => {
      if (!this.client?.isReady()) throw new ServiceError(503,'DISCORD_UNAVAILABLE','Discord is unavailable.');
      const account = await boundedDiscord(this.client.users.fetch(user,{force:true}));
      if (account.bot || account.id !== user) throw new ServiceError(403,'CHAT_DENIED','A human tester is required.');
      await verify();
      try { await boundedDiscord(account.send({content:body,allowedMentions:{parse:[]}})); }
      catch (error) { if (error instanceof DiscordAPIError && error.code === 50007) throw new ServiceError(503,'CHAT_DELIVERY_FAILED','Discord refused this DM.'); throw error; }
    },'https://discord.gg/XHSFDb7EM5');
    this.main = new MainServerClient(config, fetch, (actor, capability) => this.authorizeStaff(actor, capability));
    this.admin = new AdminService(this.store, this.monitor, this.moderation, config.mainOrigin ? this.main : undefined, (actor, capability, verifyDiscord) => this.authorizeStaff(actor, capability, verifyDiscord), config.playtestPublicApiOrigin);
    this.admin.configuration = () => configurationView(config,this.admin.content.setup());
    this.playground=new AetherPlayground(this.store,new AetherGatewayClient(config.aetherGateway),(actor,capability,fresh)=>this.authorizeStaff(actor,capability,fresh));
    this.admin.playground=this.playground;
    if (config.contentRepository) {
      this.publishing = new ContentPublishing(this.admin.content,new GitHubContentRepository(config.contentRepository,this.admin.content),(actor) => this.authorizeStaff(actor,'content:publish'));
      this.admin.content.publisher = this.publishing;
    }
    this.http = new ConnectedHttp(config, this.store, this.monitor, this.identity, this.moderation, this.admin, this.dashboard, this.participant, (user, campaign, key, hours, verify) => this.inviteParticipant(user, campaign, key, hours, verify),this.chat);
  }
  async inviteParticipant(userId: string, campaignId: string, key: string, hours: number, verify: () => Promise<void> = async () => {}) {
    participantInviteInput.parse({ discordUserId:userId, campaignId, expiresInHours:hours });
    if (!this.participant || !this.client?.isReady()) throw new ServiceError(503, 'UNAVAILABLE', 'Playtester invitations are unavailable.');
    let account: User;
    try { account = await boundedDiscord(this.client.users.fetch(userId, { force:true })); }
    catch { throw new ServiceError(503, 'ACCOUNT_UNAVAILABLE', 'The selected Discord account could not be verified. Check the account ID and try again.'); }
    if (account.id !== userId || account.bot) throw new ServiceError(400, 'INVALID_ACCOUNT', 'Select a human Discord account.');
    await verify();
    const invitation = this.participant.invite(userId, campaignId, key, hours);
    const link = new URL('/playtester/claim/', this.participant.options.redirectUri);
    link.hash = new URLSearchParams({ invitation: invitation.token }).toString();
    let delivery: 'sent' | 'failed' | 'unknown' = 'failed';
    try {
      await boundedDiscord(account.send({ content: 'You have been invited to a Wilderness Odyssey playtest. Sign in with your Discord account and claim your invitation:\n' + link.href + '\nThis link only works for your account and expires at ' + invitation.expiresAt + '. Website access does not enable game diagnostic collection.\n\n' + CHAT_GUIDE + '\nRecommended community: https://discord.gg/XHSFDb7EM5', allowedMentions: { parse: [] } }));
      delivery = 'sent';
    } catch (error) { delivery = error instanceof ServiceError && error.code === 'DISCORD_TIMEOUT' ? 'unknown' : 'failed'; }
    this.store.db.prepare('UPDATE cs_participant_invites SET delivery=? WHERE id=?').run(delivery, invitation.id);
    this.store.audit('participant-invitation', 'participant.delivery', invitation.id, delivery);
    return participantInviteSchema.parse({ schemaVersion: '1.0', invitationId: invitation.id, expiresAt: invitation.expiresAt, delivery, claimUrl: link.href });
  }
  attachDiscord(client: Client): void { this.client = client; }
  async authorizeStaff(actor: Actor, capability: Capability, verifyDiscord = true): Promise<Actor> {
    if (actor.issuer === DASHBOARD_ISSUER) {
      if (!this.dashboard || this.config.staffAuthMode !== 'discord') throw new ServiceError(403, 'FORBIDDEN', 'This action is not permitted.');
      return this.dashboard.authorize(actor, capability, verifyDiscord);
    }
    if (actor.issuer !== 'discord' && this.config.staffAuthMode === 'discord') throw new ServiceError(403, 'FORBIDDEN', 'This staff authentication method is disabled.');
    if (actor.issuer === 'discord' && this.dashboard && actor.subject) await this.dashboard.authorizeMember(actor.subject);
    const current = actor.issuer && actor.subject ? this.store.staff(actor.issuer, actor.subject) : null;
    if (!current) throw new ServiceError(403, 'FORBIDDEN', 'This action is not permitted.');
    authorize(current, capability);
    return current;
  }
  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    this.schedule(3600000, async () => { this.moderation.cleanup(); this.admin.playtestWebsite.cleanup(); this.playground.cleanup(); });
    if (!this.config.enabled) return;
    this.admin.playtestWebsite.cleanup();
    this.playground.cleanup();
    if (this.chat) { this.schedule(5000,() => this.chat!.deliver());this.schedule(3600000,async () => this.chat!.data.cleanup()); }
    if (this.publishing) this.schedule(10000,() => this.publishing!.tick());
    if (this.config.mainOrigin) {
      this.schedule(this.config.intervalMs, async () => {
        try { const observation = await this.main.health(); if (!this.stopped) this.monitor.accept(observation); }
        catch { if (!this.stopped) this.monitor.unavailable(); }
      });
      this.schedule(5000, () => this.main.process(this.store));
    }
    this.schedule(5000, () => this.deliver());
  }
  stop(): void { this.stopped = true; for (const timer of this.timers) clearTimeout(timer); this.timers.clear(); this.main.stop(); this.publishing?.stop(); this.chat?.stop(); }
  authorizeAether(request: AetherRequest): boolean {
    if (request.sourcePlatform === 'discord') {
      if (!/^\d{17,22}$/.test(request.userIdentity.platformUserId)) return false;
      return this.identity.allowedAccount(this.identity.account('discord', request.userIdentity.platformUserId));
    }
    if (request.sourcePlatform === 'minecraft' && request.permissions.includes('bridge:trusted-server') && request.guildOrServerId === this.config.serverId && request.userIdentity.linkedMinecraftUuid) {
      return this.identity.authenticate({ kind: 'official_minecraft', server_id: this.config.serverId, minecraft_uuid: request.userIdentity.linkedMinecraftUuid }).allowed;
    }
    return false;
  }
  private schedule(interval: number, task: () => Promise<void>): void {
    const run = async () => {
      if (this.stopped) return;
      try { await task(); } catch { /* Keep failures private and retry this independent task. */ }
      if (this.stopped) return;
      const timer = setTimeout(() => { this.timers.delete(timer); void run(); }, interval + Math.floor(Math.random() * 1000));
      this.timers.add(timer); timer.unref();
    };
    void run();
  }
  private async deliver(): Promise<void> {
    if (!this.client?.isReady() || !this.config.guildId) return;
    // One small delivery batch per pass; Discord outage cannot stop monitoring.
    for (const item of this.store.outbox().slice(0, 2)) {
      if (this.stopped) return;
      const channelId = item.audience === 'staff' ? this.config.staffChannel : this.config.publicChannel;
      if (!channelId) { this.store.retry(item); continue; }
      try {
        const channel = await this.client.channels.fetch(channelId);
        if (!channel || !channel.isSendable() || !('guildId' in channel) || channel.guildId !== this.config.guildId || !('messages' in channel)) throw new Error('Unavailable delivery channel.');
        const marker = '[wo-event:' + item.id + ']';
        const recent = await channel.messages.fetch({ limit: 100 });
        const existing = recent.find(message => message.author.id === this.client!.user!.id && message.content.includes(marker));
        if (this.stopped) return;
        if (existing) { this.store.delivered(item.id, existing.id); continue; }
        // Durable marker reconciles typical lost acknowledgements. Very old ambiguous deliveries can duplicate.
        const message = await channel.send({ content: item.message + '\n' + marker, allowedMentions: { parse: [] } });
        if (!this.stopped) this.store.delivered(item.id, message.id);
      } catch { if (!this.stopped) this.store.retry(item); }
    }
  }
}
let active: ConnectedRuntime | null = null;
export function initializeConnected(db: DatabaseSync, env: NodeJS.ProcessEnv = process.env): ConnectedRuntime {
  active ??= new ConnectedRuntime(db, loadConnectedConfig(env));
  active.start();
  return active;
}
export function getConnected(): ConnectedRuntime | null { return active; }
export function shutdownConnected(): void { active?.stop(); active = null; }
