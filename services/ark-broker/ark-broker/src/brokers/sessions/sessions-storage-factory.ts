import type {AppConfig} from '@ark-broker/config/index.js';
import type {Db} from '@ark-broker/db/db.js';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {SessionsStorage} from '../sessions-broker.js';
import {InMemorySessionsStorage} from './in-memory-sessions-storage.js';
import {PostgresSessionsStorage} from './postgres-sessions-storage.js';

export function createSessionsStorage(
  config: AppConfig,
  logger: Logger,
  db?: Db
): SessionsStorage {
  if (config.backends.sessions === 'postgres') {
    return new PostgresSessionsStorage(
      logger.child({broker: 'postgres-sessions'}),
      db!,
      config.backends.sessionsVisibilityTtlSeconds
    );
  }
  return new InMemorySessionsStorage(
    logger.child({broker: 'memory-sessions'}),
    config.persistence.sessionsFilePath
  );
}
