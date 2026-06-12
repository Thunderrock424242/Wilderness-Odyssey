import client from 'prom-client';
import { config } from '../config';

export const metricsRegistry = new client.Registry();

metricsRegistry.setDefaultLabels({
  service: 'wilderness-oddesy-discord-bot'
});

client.collectDefaultMetrics({ register: metricsRegistry });

export const interactionCounter = new client.Counter({
  name: 'wo_bot_interactions_total',
  help: 'Total Discord interactions handled.',
  labelNames: ['kind', 'name'] as const,
  registers: [metricsRegistry]
});

export const errorCounter = new client.Counter({
  name: 'wo_bot_errors_total',
  help: 'Total bot errors captured.',
  labelNames: ['source'] as const,
  registers: [metricsRegistry]
});

export const reportCounter = new client.Counter({
  name: 'wo_bot_reports_total',
  help: 'Total support reports created.',
  labelNames: ['type'] as const,
  registers: [metricsRegistry]
});

export function metricsEnabled(): boolean {
  return config.metrics.enabled;
}
