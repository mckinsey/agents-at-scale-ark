import {createLogger} from '../src/logging/logger.js';
import {PostgresSessionsStorage} from '../src/brokers/sessions/postgres-sessions-storage.js';
import type {Db} from '../src/db/db.js';

const logger = createLogger({level: 'silent', pretty: false});

describe('PostgresSessionsStorage listen registration', () => {
  test('retries when the first attempt fails, so the replica is not left deaf', async () => {
    // postgres.js only re-registers channels when an established listen
    // connection drops. If the first attempt is the one that fails - a replica
    // booting mid-failover - there is nothing to re-register, and that pod
    // serves reads normally while never delivering a live update again.
    const attempts: string[] = [];
    const db = {
      listen: (channel: string): Promise<void> => {
        attempts.push(channel);
        return attempts.length === 1
          ? Promise.reject(new Error('connection refused'))
          : Promise.resolve();
      },
    } as unknown as Db;

    const storage = new PostgresSessionsStorage(logger, db, 3600);
    await storage.whenListening();

    expect(attempts).toEqual(['sessions_updated', 'sessions_updated']);
  });
});
