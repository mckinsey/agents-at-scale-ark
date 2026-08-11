import type {AppConfig} from '@ark-broker/config/index.js';
import type {Db} from '@ark-broker/db/db.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {EventStream} from '../event-broker.js';
import {InMemoryEventStream} from './in-memory-event-stream.js';
import {PostgresEventStream} from './postgres-event-stream.js';

export function createEventStream(
  config: AppConfig,
  logger: Logger,
  db?: Db
): EventStream {
  if (config.backends.event === 'postgres') {
    return new PostgresEventStream(
      logger.child({broker: 'postgres-events'}),
      db!,
      config.backends.eventVisibilityTtlSeconds
    );
  }
  return new InMemoryEventStream(
    logger.child({broker: 'memory-events'}),
    'Event',
    config.persistence.eventFilePath,
    config.limits.maxEvents
  );
}
