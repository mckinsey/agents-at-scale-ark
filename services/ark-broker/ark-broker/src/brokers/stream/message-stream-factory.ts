import type {AppConfig} from '@ark-broker/config/index.js';
import type {Db} from '@ark-broker/db/db.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {MessageStream} from './message-stream.js';
import {InMemoryMessageStream} from './in-memory-message-stream.js';
import {PostgresMessageStream} from './postgres-message-stream.js';

export function createMessageStream(
  config: AppConfig,
  logger: Logger,
  db?: Db
): MessageStream {
  if (config.backends.message === 'postgres') {
    return new PostgresMessageStream(
      logger.child({broker: 'postgres'}),
      db!,
      config.backends.messageVisibilityTtlSeconds
    );
  }
  return new InMemoryMessageStream(
    logger.child({broker: 'memory'}),
    'Memory',
    config.persistence.memoryFilePath,
    config.limits.maxMessages
  );
}
