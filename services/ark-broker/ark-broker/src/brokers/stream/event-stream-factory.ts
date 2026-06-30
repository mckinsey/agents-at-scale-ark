import type {AppConfig} from '@ark-broker/config/index.js';
import type {Db} from '@ark-broker/db/db.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {EventData, EventStream} from '../event-broker.js';
import {InMemoryStream} from './in-memory-stream.js';

export function createEventStream(
  config: AppConfig,
  logger: Logger,
  _db?: Db
): EventStream {
  return new InMemoryStream<EventData>(
    logger.child({broker: 'memory-events'}),
    'Event',
    config.persistence.eventFilePath,
    config.limits.maxEvents
  );
}
