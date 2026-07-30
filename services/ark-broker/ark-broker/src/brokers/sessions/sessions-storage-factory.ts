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
    // The config schema already refuses SESSIONS_BACKEND=postgres without a
    // DATABASE_URL, so this only fires for a config built by hand or in a test
    // fixture that skipped validation. Without it the first write fails deep
    // inside postgres.js instead of here.
    if (!db) {
      throw new Error(
        'SESSIONS_BACKEND=postgres requires a Db, but none was passed to createSessionsStorage'
      );
    }
    return new PostgresSessionsStorage(
      logger.child({broker: 'postgres-sessions'}),
      db,
      config.backends.sessionsVisibilityTtlSeconds
    );
  }
  return new InMemorySessionsStorage(
    logger.child({broker: 'memory-sessions'}),
    config.persistence.sessionsFilePath
  );
}
