import { randomUUID } from 'node:crypto';
import { observationSchema, publicStatusV2Schema, unknownAether, unknownMinecraft, type Incident, type Observation, type PublicStatus } from './contracts';
import { ConnectedStore } from './store';
import { publicStatusSchema } from '../contracts/v1/status';

type Counter = { bad: number; good: number; incident?: string; last: number; maintenance: boolean };
export type Maintenance = { active: boolean; message: string; services: ('minecraft' | 'aether')[]; startsAt: string | null; endsAt: string | null; revision: string };
export class ServiceMonitor {
  constructor(readonly store: ConnectedStore, readonly serverId: string, readonly clock: () => number = Date.now, readonly failures = 3, readonly recoveries = 2, readonly staleSeconds = 120) {}
  maintenance(): Maintenance {
    const stored = this.store.get<Maintenance>('maintenance') ?? { active: false, message: '', services: [], startsAt: null, endsAt: null, revision: 'initial' };
    return { ...stored, active: stored.active && (!stored.startsAt || Date.parse(stored.startsAt) <= this.clock()) && (!stored.endsAt || Date.parse(stored.endsAt) > this.clock()) };
  }
  accept(input: unknown): void {
    const observed = observationSchema.parse(input);
    if (observed.server_id !== this.serverId) throw new Error('Unexpected server identity.');
    const previous = this.store.get<Observation>('observation');
    const age = this.clock() - Date.parse(observed.observed_at);
    if (age < -60_000 || age > this.staleSeconds * 1000) throw new Error('Stale observation.');
    if (previous && (Date.parse(observed.observed_at) <= Date.parse(previous.observed_at) || (observed.boot_id === previous.boot_id && observed.sequence <= previous.sequence))) throw new Error('Invalid observation sequence.');
    for (const part of [observed.minecraft, observed.aether]) {
      if (part.checked_at && (Date.parse(part.checked_at) > Date.parse(observed.observed_at) + 5000 || Date.parse(part.checked_at) < this.clock() - this.staleSeconds * 1000)) throw new Error('Invalid component observation time.');
      if (part.status !== 'unknown' && !part.checked_at) throw new Error('Missing component observation time.');
    }
    const evidence = {
      minecraft: this.store.get<Observation['minecraft']>('evidence:minecraft') ?? previous?.minecraft,
      aether: this.store.get<Observation['aether']>('evidence:aether') ?? previous?.aether,
    };
    for (const component of ['minecraft', 'aether'] as const) {
      const before = evidence[component], next = observed[component];
      if (!before?.checked_at || !next.checked_at) continue;
      if (Date.parse(next.checked_at) < Date.parse(before.checked_at)) throw new Error('Regressing component observation.');
      if (next.checked_at === before.checked_at && JSON.stringify(next) !== JSON.stringify(before)) throw new Error('Component evidence changed without a new observation.');
    }
    this.store.transaction(() => {
      this.store.set('observation', observed);
      this.store.set('generated_at', new Date(this.clock()).toISOString());
      this.store.set('collector_error', false);
      const maintenance = this.maintenance();
      for (const component of ['minecraft', 'aether'] as const) {
        const sample = observed[component];
        const missing = sample.status === 'unknown' || !sample.checked_at;
        this.transition(component === 'minecraft' ? 'minecraft:evidence' : 'aether:evidence', missing, !missing, maintenance.active && maintenance.services.includes(component));
        if (sample.checked_at) this.store.set('evidence:' + component, sample);
        if (evidence[component]?.checked_at === sample.checked_at) continue;
        const performanceBad = component === 'minecraft' ? this.performance(observed) : false;
        const bad = sample.status === 'offline' || sample.status === 'degraded' || performanceBad;
        this.transition(component, bad, sample.status === 'online' && !performanceBad && (component !== 'minecraft' || !this.store.get<boolean>('performance_degraded')), maintenance.active && maintenance.services.includes(component), performanceBad ? 1 : this.failures);
      }
      this.transition('monitoring', false, true, false);
    });
  }
  private performance(observation: Observation): boolean {
    const mc = observation.minecraft;
    if (!mc.checked_at) return false;
    const history = this.store.get<{ observedAt: string; tps: number | null; mspt: number | null; players: number | null }[]>('performance') ?? [];
    history.push({ observedAt: mc.checked_at!, tps: mc.tps, mspt: mc.mspt, players: mc.players_online });
    this.store.set('performance', history.slice(-120));
    type Window = { start: number; last: number; count: number; tps: number; mspt: number; bad: number; good: number };
    const now = Date.parse(mc.checked_at!);
    let window = this.store.get<Window>('performance_window');
    if (mc.tps === null || mc.mspt === null || mc.status === 'unknown' || mc.status === 'offline' || this.maintenance().active || !window || now - window.last > 45000) {
      this.store.set('performance_window', { start: now, last: now, count: 0, tps: 0, mspt: 0, bad: 0, good: 0 });
      return false;
    }
    window.last = now; window.count++; window.tps += mc.tps; window.mspt += mc.mspt;
    if (now - window.start >= 60000 && window.count >= 2) {
      const tps = window.tps / window.count, mspt = window.mspt / window.count;
      window.bad = tps < 15 || mspt > 80 ? window.bad + 1 : 0;
      window.good = tps > 18 && mspt < 55 ? window.good + 1 : 0;
      if (window.bad >= 3) this.store.set('performance_degraded', true);
      if (window.good >= 2) this.store.set('performance_degraded', false);
      window = { ...window, start: now, count: 0, tps: 0, mspt: 0 };
    }
    this.store.set('performance_window', window);
    return this.store.get<boolean>('performance_degraded') ?? false;
  }
  unavailable(): void {
    this.store.transaction(() => {
      this.store.set('collector_error', true);
      this.transition('monitoring', true, false, false);
    });
  }
  private transition(component: 'minecraft' | 'aether' | 'monitoring' | 'minecraft:evidence' | 'aether:evidence', bad: boolean, good: boolean, maintenance: boolean, threshold = this.failures): void {
    const counter = this.store.get<Counter>('counter:' + component) ?? { bad: 0, good: 0, last: 0, maintenance: false };
    if (this.clock() - counter.last > this.staleSeconds * 1000 || counter.maintenance !== maintenance) { counter.bad = 0; counter.good = 0; }
    counter.last = this.clock(); counter.maintenance = maintenance;
    counter.bad = !maintenance && bad ? counter.bad + 1 : 0;
    counter.good = !maintenance && good ? counter.good + 1 : 0;
    const now = new Date(this.clock()).toISOString();
    const evidence = component.endsWith(':evidence');
    const label = component.startsWith('minecraft') ? 'Minecraft' : 'Aether';
    if (counter.bad >= threshold && !counter.incident) {
      const incident: Incident = { id: randomUUID(), component: evidence ? 'monitoring' : component as Incident['component'], status: 'investigating', summary: evidence ? label + ' measurements are unavailable. Live availability is unknown.' : component === 'monitoring' ? 'Service monitoring is unavailable. Live availability is unknown.' : component === 'minecraft' ? 'Minecraft service is unavailable or experiencing degraded performance.' : 'Aether service is unavailable or experiencing degraded performance.', timestamps: { started_at: now, updated_at: now, resolved_at: null } };
      counter.incident = incident.id;
      this.publish(incident, 'outage');
    } else if (counter.good >= this.recoveries && counter.incident) {
      const incident = this.store.record<Incident>('incident', counter.incident);
      if (incident) { incident.status = 'resolved'; incident.summary = evidence ? label + ' measurements have recovered.' : component === 'monitoring' ? 'Service monitoring has recovered.' : `${component === 'minecraft' ? 'Minecraft' : 'Aether'} service has recovered.`; incident.timestamps.updated_at = now; incident.timestamps.resolved_at = now; this.publish(incident, 'recovery'); }
      delete counter.incident;
    }
    this.store.set('counter:' + component, counter);
  }
  private publish(incident: Incident, event: string): void {
    this.store.put('incident', incident.id, incident.component, incident);
    this.store.enqueue(incident.id + ':' + event, 'staff', incident.summary);
    if (incident.component !== 'monitoring') {
      this.store.enqueue(incident.id + ':' + event, 'public', incident.summary);
      this.store.put('announcement', incident.id + '-' + event, incident.id, { id: incident.id + '-' + event, title: event === 'recovery' ? 'Service recovered' : 'Service incident', message: incident.summary, published_at: incident.timestamps.updated_at });
    }
  }
  publicStatus(): PublicStatus {
    const observation = this.store.get<Observation>('observation');
    const stale = !observation || this.clock() - Date.parse(observation.observed_at) > this.staleSeconds * 1000 || this.store.get<boolean>('collector_error');
    const maintenance = this.maintenance();
    const minecraft = stale || !observation?.minecraft.checked_at || this.clock() - Date.parse(observation.minecraft.checked_at) > this.staleSeconds * 1000 ? unknownMinecraft() : { ...observation.minecraft };
    const aether = stale || !observation?.aether.checked_at || this.clock() - Date.parse(observation.aether.checked_at) > this.staleSeconds * 1000 ? unknownAether() : { ...observation.aether };
    if (minecraft.status === 'online' && minecraft.tps !== null && minecraft.mspt !== null && this.store.get<boolean>('performance_degraded')) minecraft.status = 'degraded';
    if (maintenance.active) for (const part of maintenance.services) (part === 'minecraft' ? minecraft : aether).status = 'maintenance';
    return publicStatusV2Schema.parse({
      schema_version: '2.0', generated_at: this.store.get<string>('generated_at') ?? new Date(0).toISOString(), stale_after_seconds: this.staleSeconds,
      minecraft, aether, maintenance: { active: maintenance.active, affected_components: maintenance.services, message: maintenance.message, starts_at: maintenance.startsAt, ends_at: maintenance.endsAt },
      incidents: this.store.records<Incident>('incident', undefined, 30), announcements: this.store.records('announcement', undefined, 20),
    });
  }
  legacyStatus() {
    const status = this.publicStatus();
    const mc = status.minecraft, ai = status.aether;
    return publicStatusSchema.parse({
      schemaVersion: '1.0', observedAt: status.generated_at, staleAfterSeconds: status.stale_after_seconds,
      minecraft: { state: mc.status === 'maintenance' ? 'unknown' : mc.status, players: mc.players_online !== null && mc.players_max !== null ? { online: mc.players_online, max: mc.players_max } : null, tps: mc.tps, mspt: mc.mspt, minecraftVersion: mc.minecraft_version, modpackVersion: mc.modpack_version, loader: null },
      aether: { ollama: ai.ollama_reachable === null ? 'unknown' : ai.ollama_reachable ? 'ready' : 'unavailable', inference: ai.inference_available === null ? 'unknown' : ai.inference_available ? 'ready' : 'unavailable', requestsPaused: ai.requests_paused, responseLatency: null },
      maintenance: { active: status.maintenance.active, message: status.maintenance.message, startsAt: status.maintenance.starts_at, endsAt: status.maintenance.ends_at, services: status.maintenance.affected_components },
      incidents: status.incidents.map(item => ({ id: item.id, title: item.component === 'minecraft' ? 'Minecraft service' : 'Aether service', message: item.summary, severity: 'major', state: item.status, services: item.component === 'minecraft' ? ['minecraft'] : item.component === 'aether' ? ['aether'] : [], updatedAt: item.timestamps.updated_at })),
    });
  }
}
