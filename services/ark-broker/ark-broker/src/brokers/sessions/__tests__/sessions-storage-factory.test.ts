import {loadConfig} from '@ark-broker/config/index.js';
import {createLogger} from '@ark-broker/logging/logger.js';
import type {Db} from '@ark-broker/db/db.js';
import {createSessionsStorage} from '../sessions-storage-factory.js';
import {InMemorySessionsStorage} from '../in-memory-sessions-storage.js';
import {PostgresSessionsStorage} from '../postgres-sessions-storage.js';

const silentLogger = createLogger({level: 'silent', pretty: false});

const postgresEnv = {
  SESSIONS_BACKEND: 'postgres',
  MESSAGE_BACKEND: 'postgres',
  EVENT_BACKEND: 'postgres',
  DATABASE_URL: 'postgres://user:pw@localhost:5432/ark',
};

describe('createSessionsStorage', () => {
  test('builds the in-memory backend by default', () => {
    const storage = createSessionsStorage(loadConfig({}), silentLogger);
    expect(storage).toBeInstanceOf(InMemorySessionsStorage);
  });

  test('builds the Postgres backend when selected', () => {
    // Never connects: the constructor only registers a LISTEN, which this stub
    // resolves, and nothing in this test issues a query.
    const db = {
      listen: async (): Promise<void> => undefined,
    } as unknown as Db;
    const storage = createSessionsStorage(
      loadConfig(postgresEnv),
      silentLogger,
      db
    );
    expect(storage).toBeInstanceOf(PostgresSessionsStorage);
  });

  test('refuses the Postgres backend without a Db instead of failing later', () => {
    expect(() =>
      createSessionsStorage(loadConfig(postgresEnv), silentLogger)
    ).toThrow(/requires a Db/);
  });
});
