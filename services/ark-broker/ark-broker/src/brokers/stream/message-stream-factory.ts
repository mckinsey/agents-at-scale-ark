import type {AppConfig} from '@ark-broker/config/index.js';
import type {Db} from '@ark-broker/db/db.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {MessageData} from '../memory-broker.js';
import type {Stream} from './stream.js';
import {InMemoryStream} from './in-memory-stream.js';
import {PostgresMessageStream} from './postgres-message-stream.js';

export function createMessageStream(
  config: AppConfig,
  logger: Logger,
  db?: Db
): Stream<MessageData> {
  if (config.backends.message === 'postgres') {
    return new PostgresMessageStream(
      logger.child({broker: 'postgres'}),
      db!,
      config.backends.messageVisibilityTtlSeconds
    );
  }
  return new InMemoryStream<MessageData>(
    logger.child({broker: 'memory'}),
    'Memory',
    config.persistence.memoryFilePath,
    config.limits.maxMessages
  );
}
