import type { Client } from 'discord.js';
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
import type { Capability } from '../contracts/v1/admin';
export class ConnectedRuntime {
  readonly store: ConnectedStore;
  readonly identity: IdentityService;
  readonly monitor: ServiceMonitor;
  readonly moderation: ModerationService;
  readonly admin: AdminService;
  readonly http: ConnectedHttp;
  readonly main: MainServerClient;
  readonly dashboard?: DashboardAuth;
  private client?: Client;
  private readonly timers = new Set<NodeJS.Timeout>();
  private stopped = false;
  private started = false;
  constructor(db: DatabaseSync, readonly config: ConnectedConfig) {
    this.store = new ConnectedStore(db);
    this.identity = new IdentityService(this.store, config.serverId);
    this.monitor = new ServiceMonitor(this.store, config.serverId, Date.now, config.failures, config.recoveries, config.staleSeconds);
    this.moderation = new ModerationService(this.store, this.identity);
    if (config.discord) this.dashboard = new DashboardAuth(this.store, config.discord, async (guildId, userId) => {
      if (!this.client?.isReady()) throw new ServiceError(503, 'DISCORD_UNAVAILABLE', 'Discord permissions could not be verified. Try again later.');
      await requireDiscordAdministrator(this.client.rest, guildId, userId);
    });
    this.main = new MainServerClient(config, fetch, (actor, capability) => this.authorizeStaff(actor, capability));
    this.admin = new AdminService(this.store, this.monitor, this.moderation, config.mainOrigin ? this.main : undefined, (actor, capability) => this.authorizeStaff(actor, capability));
    this.http = new ConnectedHttp(config, this.store, this.monitor, this.identity, this.moderation, this.admin, this.dashboard);
  }
  attachDiscord(client: Client): void { this.client = client; }
  async authorizeStaff(actor: Actor, capability: Capability): Promise<Actor> {
    if (actor.issuer === DASHBOARD_ISSUER) {
      if (!this.dashboard || this.config.staffAuthMode !== 'discord') throw new ServiceError(403, 'FORBIDDEN', 'This action is not permitted.');
      return this.dashboard.authorize(actor, capability);
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
    this.schedule(3600000, async () => this.moderation.cleanup());
    if (!this.config.enabled) return;
    if (this.config.mainOrigin) {
      this.schedule(this.config.intervalMs, async () => {
        try { const observation = await this.main.health(); if (!this.stopped) this.monitor.accept(observation); }
        catch { if (!this.stopped) this.monitor.unavailable(); }
      });
      this.schedule(5000, () => this.main.process(this.store));
    }
    this.schedule(5000, () => this.deliver());
  }
  stop(): void { this.stopped = true; for (const timer of this.timers) clearTimeout(timer); this.timers.clear(); this.main.stop(); }
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
