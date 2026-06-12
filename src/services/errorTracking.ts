import * as Sentry from '@sentry/node';
import { config } from '../config';
import { logger } from '../utils/logger';
import { errorCounter } from './metricsService';

let initialized = false;

export function initErrorTracking(): void {
  if (!config.sentry.dsn || initialized) {
    return;
  }

  Sentry.init({
    dsn: config.sentry.dsn,
    tracesSampleRate: 0.05
  });
  initialized = true;
  logger.info('Sentry error tracking enabled.');
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  errorCounter.inc({ source: typeof context?.source === 'string' ? context.source : 'unknown' });

  if (initialized) {
    Sentry.captureException(error, { extra: context });
    return;
  }

  logger.error({ error, ...context }, 'Unhandled error captured.');
}
