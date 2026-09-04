import postgres from 'postgres';
import {createLogger} from '@ark-broker/logging/logger.js';
import type {Db} from '@ark-broker/db/db.js';
import {createReaper, type Reaper} from '../reaper.js';
import {usePgContainer} from './testHelpers/pg-testcontainer.js';

jest.setTimeout(120_000);

const silentLogger = createLogger({level: 'silent', pretty: false});

async function insertMessage(
  db: Db,
  expiresOffsetSeconds: number
): Promise<void> {
  await db`
    INSERT INTO messages (conversation_id, query_id, message, expires_at)
    VALUES ('c1', 'q1', '{}'::jsonb, now() + make_interval(secs => ${expiresOffsetSeconds}))
  `;
}

async function insertEvent(
  db: Db,
  expiresOffsetSeconds: number
): Promise<void> {
  await db`
    INSERT INTO events (query_id, session_id, reason, event, expires_at)
    VALUES ('q1', 's1', 'TestReason', '{}'::jsonb, now() + make_interval(secs => ${expiresOffsetSeconds}))
  `;
}

async function insertSession(
  db: Db,
  sessionId: string,
  expiresOffsetSeconds: number
): Promise<void> {
  await db`
    INSERT INTO sessions (session_id, name, expires_at)
    VALUES (${sessionId}, ${sessionId}, now() + make_interval(secs => ${expiresOffsetSeconds}))
  `;
}

async function insertSessionQuery(
  db: Db,
  sessionId: string,
  queryId: string
): Promise<void> {
  await db`
    INSERT INTO session_queries (session_id, query_id, phase)
    VALUES (${sessionId}, ${queryId}, 'done')
  `;
}

async function countRows(db: Db, table: string): Promise<number> {
  const [{count}] = await db<[{count: string}]>`
    SELECT count(*)::text AS count FROM ${db(table)}
  `;
  return Number(count);
}

describe('createReaper', () => {
  const {db, connectionUrl} = usePgContainer();

  function makeReaper(
    overrides: Partial<{
      tables: string[];
      intervalSeconds: number;
      batchSize: number;
    }> = {}
  ): Reaper {
    return createReaper({
      logger: silentLogger,
      db: db(),
      tables: overrides.tables ?? ['messages', 'events'],
      intervalSeconds: overrides.intervalSeconds ?? 3600,
      batchSize: overrides.batchSize ?? 1000,
    });
  }

  describe('reapOnce', () => {
    it('deletes physically expired message rows', async () => {
      await insertMessage(db(), -10);
      await insertMessage(db(), -10);

      await makeReaper().reapOnce();

      expect(await countRows(db(), 'messages')).toBe(0);
    });

    it('keeps unexpired message rows', async () => {
      await insertMessage(db(), -10);
      await insertMessage(db(), 3600);

      await makeReaper().reapOnce();

      expect(await countRows(db(), 'messages')).toBe(1);
    });

    it('deletes expired event rows', async () => {
      await insertEvent(db(), -10);
      await insertEvent(db(), 3600);

      await makeReaper().reapOnce();

      expect(await countRows(db(), 'events')).toBe(1);
    });

    it('returns the total number of deleted rows across tables', async () => {
      await insertMessage(db(), -10);
      await insertMessage(db(), -10);
      await insertEvent(db(), -10);
      await insertMessage(db(), 3600);

      const deleted = await makeReaper().reapOnce();

      expect(deleted).toBe(3);
    });

    it('drains a backlog larger than one batch', async () => {
      for (let i = 0; i < 5; i++) {
        await insertMessage(db(), -10);
      }

      const deleted = await makeReaper({batchSize: 2}).reapOnce();

      expect(deleted).toBe(5);
      expect(await countRows(db(), 'messages')).toBe(0);
    });

    it('skips rows locked by a concurrent transaction instead of blocking', async () => {
      await insertMessage(db(), -10);
      const lockDb = postgres(connectionUrl(), {max: 1});
      try {
        await lockDb.begin(async (tx) => {
          await tx`SELECT * FROM messages FOR UPDATE`;
          const deleted = await makeReaper().reapOnce();
          expect(deleted).toBe(0);
        });
      } finally {
        await lockDb.end();
      }
      expect(await countRows(db(), 'messages')).toBe(1);
    }, 15_000);

    it('deletes expired session rows', async () => {
      await insertSession(db(), 's-expired', -10);
      await insertSession(db(), 's-live', 3600);

      await makeReaper({tables: ['sessions']}).reapOnce();

      expect(await countRows(db(), 'sessions')).toBe(1);
    });

    it('cascades to the session_queries of a reaped session', async () => {
      await insertSession(db(), 's-expired', -10);
      await insertSessionQuery(db(), 's-expired', 'q1');
      await insertSession(db(), 's-live', 3600);
      await insertSessionQuery(db(), 's-live', 'q2');

      await makeReaper({tables: ['sessions']}).reapOnce();

      expect(await countRows(db(), 'session_queries')).toBe(1);
    });

    it('only touches configured tables', async () => {
      await insertMessage(db(), -10);
      await insertEvent(db(), -10);

      await makeReaper({tables: ['events']}).reapOnce();

      expect(await countRows(db(), 'messages')).toBe(1);
      expect(await countRows(db(), 'events')).toBe(0);
    });
  });

  describe('start', () => {
    it('reaps immediately on start', async () => {
      await insertMessage(db(), -10);
      const reaper = makeReaper();

      reaper.start();
      try {
        await waitFor(async () => (await countRows(db(), 'messages')) === 0);
      } finally {
        await reaper.stop();
      }
    });

    it('reaps again on the next interval tick', async () => {
      const reaper = makeReaper({intervalSeconds: 1});

      reaper.start();
      try {
        await waitFor(async () => (await countRows(db(), 'messages')) === 0);
        await insertMessage(db(), -10);
        await waitFor(async () => (await countRows(db(), 'messages')) === 0);
      } finally {
        await reaper.stop();
      }
    });

    it('stops reaping after stop', async () => {
      const reaper = makeReaper({intervalSeconds: 1});

      reaper.start();
      // Awaiting stop drains the run start() kicked off; without that the
      // insert below races it and the row is reaped by the stopped reaper.
      await reaper.stop();
      await insertMessage(db(), -10);
      await new Promise((r) => setTimeout(r, 1500));

      expect(await countRows(db(), 'messages')).toBe(1);
    });

    it('abandons the remaining batches when stopped mid-drain', async () => {
      for (let i = 0; i < 300; i++) {
        await insertMessage(db(), -10);
      }
      const reaper = makeReaper({batchSize: 1});

      reaper.start();
      await reaper.stop();

      expect(await countRows(db(), 'messages')).toBeGreaterThan(0);
    });
  });
});

async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs = 5000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('condition not met within timeout');
}
