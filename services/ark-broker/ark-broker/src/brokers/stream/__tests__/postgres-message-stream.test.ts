import postgres from 'postgres';
import {createLogger} from '@ark-broker/logging/logger.js';
import {usePgContainer} from '../../../db/__tests__/testHelpers/pg-testcontainer.js';
import {PostgresMessageStream} from '../postgres-message-stream.js';
import {makeMessageData} from './testHelpers/message-data-factory.js';

jest.setTimeout(120_000);

const silentLogger = createLogger({level: 'silent', pretty: false});

describe('PostgresMessageStream', () => {
  const {db, connectionUrl} = usePgContainer();
  let stream: PostgresMessageStream;

  beforeAll(() => {
    stream = new PostgresMessageStream(silentLogger, db(), 3600);
  });

  describe('append', () => {
    it('assigns sequenceNumber starting at 1', async () => {
      const item = await stream.append(makeMessageData());
      expect(item.sequenceNumber).toBe(1);
    });

    it('increments sequenceNumber monotonically', async () => {
      const a = await stream.append(makeMessageData());
      const b = await stream.append(makeMessageData());
      const c = await stream.append(makeMessageData());
      expect(a.sequenceNumber).toBe(1);
      expect(b.sequenceNumber).toBe(2);
      expect(c.sequenceNumber).toBe(3);
    });

    it('returns item with timestamp as Date', async () => {
      const item = await stream.append(makeMessageData());
      expect(item.timestamp).toBeInstanceOf(Date);
    });

    it('fires subscribe callback during append', async () => {
      const received: number[] = [];
      stream.subscribe((item) => received.push(item.sequenceNumber));
      await stream.append(makeMessageData());
      expect(received).toHaveLength(1);
    });
  });

  describe('appendMany', () => {
    it('returns [] and issues no query for an empty array', async () => {
      const queries: string[] = [];
      const debugDb = postgres(connectionUrl(), {
        debug: (_id: number, query: string): void => {
          queries.push(query);
        },
      });
      const debugStream = new PostgresMessageStream(
        silentLogger,
        debugDb,
        3600
      );

      const items = await debugStream.appendMany([]);

      expect(items).toEqual([]);
      expect(queries).toHaveLength(0);
      await debugDb.end();
    });

    it('inserts every message in a single round-trip', async () => {
      const queries: string[] = [];
      const debugDb = postgres(connectionUrl(), {
        debug: (_id: number, query: string): void => {
          queries.push(query);
        },
      });
      // postgres.js runs a one-off type-oid bootstrap query the first time a
      // fresh connection is used; warm it up so it doesn't skew the count.
      await debugDb`SELECT 1`;
      queries.length = 0;
      const debugStream = new PostgresMessageStream(
        silentLogger,
        debugDb,
        3600
      );

      await debugStream.appendMany([
        makeMessageData(),
        makeMessageData(),
        makeMessageData(),
      ]);

      expect(queries).toHaveLength(1);
      expect(queries[0]).toMatch(/insert into messages/i);
      await debugDb.end();
    });

    it('returns items in sequence/input order and emits one item event per row', async () => {
      const dataList = [
        makeMessageData(),
        makeMessageData(),
        makeMessageData(),
      ];
      const received: number[] = [];
      stream.subscribe((item) => received.push(item.sequenceNumber));

      const items = await stream.appendMany(dataList);

      expect(items.map((item) => item.sequenceNumber)).toEqual([1, 2, 3]);
      expect(items.map((item) => item.data)).toEqual(dataList);
      expect(received).toEqual([1, 2, 3]);
    });

    it('uses ttlSeconds for every row in the batch', async () => {
      const customTtl = 60;
      const before = Date.now();
      const items = await stream.appendMany(
        [makeMessageData(), makeMessageData()],
        customTtl
      );
      const after = Date.now();

      const pgDb = db();
      const rows = await pgDb<{expires_at: Date}[]>`
        SELECT expires_at FROM messages
        WHERE sequence_number = ANY(${items.map((item) => item.sequenceNumber)})
      `;
      for (const row of rows) {
        const expiresAt = row.expires_at.getTime();
        expect(expiresAt).toBeGreaterThanOrEqual(
          before + customTtl * 1000 - 2000
        );
        expect(expiresAt).toBeLessThanOrEqual(after + customTtl * 1000 + 2000);
      }
    });

    it('inserts a large batch without exceeding the call stack', async () => {
      const dataList = Array.from({length: 5000}, () => makeMessageData());

      const items = await stream.appendMany(dataList);

      expect(items).toHaveLength(5000);
      expect(await stream.getCurrentSequence()).toBe(5000);
    });
  });

  describe('all', () => {
    it('returns empty array initially', async () => {
      expect(await stream.all()).toEqual([]);
    });

    it('returns all appended items in order', async () => {
      await stream.append(makeMessageData());
      await stream.append(makeMessageData());
      const all = await stream.all();
      expect(all).toHaveLength(2);
      expect(all[0].sequenceNumber).toBe(1);
      expect(all[1].sequenceNumber).toBe(2);
    });
  });

  describe('filter', () => {
    it('returns only matching items', async () => {
      const a = await stream.append(makeMessageData());
      await stream.append(makeMessageData());
      const result = await stream.filter(
        (item) => item.sequenceNumber === a.sequenceNumber
      );
      expect(result).toHaveLength(1);
      expect(result[0].sequenceNumber).toBe(a.sequenceNumber);
    });

    it('returns empty array when nothing matches', async () => {
      await stream.append(makeMessageData());
      expect(await stream.filter(() => false)).toHaveLength(0);
    });
  });

  describe('paginate', () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        await stream.append(makeMessageData());
      }
    });

    it('returns up to limit items', async () => {
      const result = await stream.paginate({limit: 2});
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(2);
    });

    it('applies cursor to skip already-seen items', async () => {
      const result = await stream.paginate({limit: 2, cursor: 2});
      expect(result.items).toHaveLength(2);
      expect(result.items[0].sequenceNumber).toBe(3);
    });

    it('sets hasMore=false and nextCursor=undefined on last page', async () => {
      const result = await stream.paginate({limit: 10});
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeUndefined();
    });

    it('applies predicate before pagination', async () => {
      const result = await stream.paginate(
        {limit: 10},
        (item) => item.sequenceNumber % 2 === 1
      );
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
    });
  });

  describe('delete', () => {
    it('removes all items when called without predicate', async () => {
      await stream.append(makeMessageData());
      await stream.append(makeMessageData());
      await stream.delete();
      expect(await stream.all()).toHaveLength(0);
      const next = await stream.append(makeMessageData());
      expect(next.sequenceNumber).toBe(3);
    });

    it('removes only matching items when predicate is provided', async () => {
      const a = await stream.append(makeMessageData());
      await stream.append(makeMessageData());
      await stream.delete((item) => item.sequenceNumber === a.sequenceNumber);
      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0].sequenceNumber).toBe(2);
    });

    it('does not reset sequence when using predicate', async () => {
      const a = await stream.append(makeMessageData());
      await stream.delete((item) => item.sequenceNumber === a.sequenceNumber);
      const next = await stream.append(makeMessageData());
      expect(next.sequenceNumber).toBe(2);
    });
  });

  describe('filterBy', () => {
    it('returns only items matching conversationId, in sequence order', async () => {
      const conversationId = 'conv-' + Math.random().toString(36).slice(2);
      const a = await stream.append(makeMessageData({conversationId}));
      const b = await stream.append(makeMessageData({conversationId}));
      await stream.append(makeMessageData());

      const result = await stream.filterBy({conversationId});

      expect(result.map((item) => item.sequenceNumber)).toEqual([
        a.sequenceNumber,
        b.sequenceNumber,
      ]);
    });

    it('returns only items matching queryId', async () => {
      const queryId = 'q-' + Math.random().toString(36).slice(2);
      const a = await stream.append(makeMessageData({queryId}));
      await stream.append(makeMessageData());

      const result = await stream.filterBy({queryId});

      expect(result).toHaveLength(1);
      expect(result[0]!.sequenceNumber).toBe(a.sequenceNumber);
    });

    it('combines conversationId and queryId as AND', async () => {
      const conversationId = 'conv-' + Math.random().toString(36).slice(2);
      const queryId = 'q-' + Math.random().toString(36).slice(2);
      const match = await stream.append(
        makeMessageData({conversationId, queryId})
      );
      await stream.append(makeMessageData({conversationId}));
      await stream.append(makeMessageData({queryId}));

      const result = await stream.filterBy({conversationId, queryId});

      expect(result).toHaveLength(1);
      expect(result[0]!.sequenceNumber).toBe(match.sequenceNumber);
    });

    it('returns empty array when nothing matches', async () => {
      await stream.append(makeMessageData());
      const result = await stream.filterBy({
        conversationId: 'nonexistent-conversation-id',
      });
      expect(result).toHaveLength(0);
    });

    it('applies afterSequence as a keyset cursor', async () => {
      const conversationId = 'conv-' + Math.random().toString(36).slice(2);
      const a = await stream.append(makeMessageData({conversationId}));
      const b = await stream.append(makeMessageData({conversationId}));
      const c = await stream.append(makeMessageData({conversationId}));

      const result = await stream.filterBy({
        conversationId,
        afterSequence: a.sequenceNumber,
      });

      expect(result.map((item) => item.sequenceNumber)).toEqual([
        b.sequenceNumber,
        c.sequenceNumber,
      ]);
    });
  });

  describe('paginateBy', () => {
    it('returns only items matching the filter', async () => {
      const conversationId = 'conv-' + Math.random().toString(36).slice(2);
      await stream.append(makeMessageData({conversationId}));
      await stream.append(makeMessageData({conversationId}));
      await stream.append(makeMessageData());

      const result = await stream.paginateBy({limit: 10}, {conversationId});

      expect(result.items).toHaveLength(2);
      expect(
        result.items.every(
          (item) => item.data.conversationId === conversationId
        )
      ).toBe(true);
    });

    it('paginates a filtered subset across multiple keyset pages', async () => {
      const conversationId = 'conv-' + Math.random().toString(36).slice(2);
      const appended = [];
      for (let i = 0; i < 5; i++) {
        appended.push(await stream.append(makeMessageData({conversationId})));
      }
      await stream.append(makeMessageData());

      const page1 = await stream.paginateBy({limit: 2}, {conversationId});
      expect(page1.items).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.items.map((item) => item.sequenceNumber)).toEqual([
        appended[0]!.sequenceNumber,
        appended[1]!.sequenceNumber,
      ]);
      expect(page1.nextCursor).toBe(appended[1]!.sequenceNumber);

      const page2 = await stream.paginateBy(
        {limit: 2, cursor: page1.nextCursor},
        {conversationId}
      );
      expect(page2.items.map((item) => item.sequenceNumber)).toEqual([
        appended[2]!.sequenceNumber,
        appended[3]!.sequenceNumber,
      ]);
      expect(page2.hasMore).toBe(true);

      const page3 = await stream.paginateBy(
        {limit: 2, cursor: page2.nextCursor},
        {conversationId}
      );
      expect(page3.items.map((item) => item.sequenceNumber)).toEqual([
        appended[4]!.sequenceNumber,
      ]);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextCursor).toBeUndefined();
    });

    it('works without a filter, mirroring paginate', async () => {
      for (let i = 0; i < 3; i++) {
        await stream.append(makeMessageData());
      }
      const result = await stream.paginateBy({limit: 10});
      expect(result.items).toHaveLength(3);
    });
  });

  describe('deleteBy', () => {
    it('removes only rows matching conversationId, leaving others intact', async () => {
      const convA = 'conv-a-' + Math.random().toString(36).slice(2);
      const convB = 'conv-b-' + Math.random().toString(36).slice(2);
      await stream.append(makeMessageData({conversationId: convA}));
      await stream.append(makeMessageData({conversationId: convA}));
      const survivor = await stream.append(
        makeMessageData({conversationId: convB})
      );

      await stream.deleteBy({conversationId: convA});

      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0]!.sequenceNumber).toBe(survivor.sequenceNumber);
    });

    it('removes only rows matching queryId, leaving others intact', async () => {
      const queryA = 'q-a-' + Math.random().toString(36).slice(2);
      const queryB = 'q-b-' + Math.random().toString(36).slice(2);
      await stream.append(makeMessageData({queryId: queryA}));
      const survivor = await stream.append(makeMessageData({queryId: queryB}));

      await stream.deleteBy({queryId: queryA});

      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0]!.sequenceNumber).toBe(survivor.sequenceNumber);
    });

    it('removes rows regardless of expiry (ignores TTL)', async () => {
      const conversationId = 'conv-' + Math.random().toString(36).slice(2);
      const item = await stream.append(makeMessageData({conversationId}), 1);
      await new Promise((resolve) => setTimeout(resolve, 1500));

      await stream.deleteBy({conversationId});

      const pgDb = db();
      const rows = await pgDb`
        SELECT sequence_number FROM messages WHERE sequence_number = ${item.sequenceNumber}
      `;
      expect(rows).toHaveLength(0);
    });

    it('rejects an empty filter without deleting anything', async () => {
      await stream.append(makeMessageData());
      await expect(stream.deleteBy({})).rejects.toThrow();
      expect(await stream.all()).toHaveLength(1);
    });

    it('rejects an empty-string conversationId without deleting anything', async () => {
      await stream.append(makeMessageData());
      await expect(stream.deleteBy({conversationId: ''})).rejects.toThrow();
      expect(await stream.all()).toHaveLength(1);
    });

    it('rejects an empty-string queryId without deleting anything', async () => {
      await stream.append(makeMessageData());
      await expect(stream.deleteBy({queryId: ''})).rejects.toThrow();
      expect(await stream.all()).toHaveLength(1);
    });
  });

  describe('deleteByQuery', () => {
    it('removes only rows with the given query_id', async () => {
      const qA = 'qa-' + Math.random().toString(36).slice(2);
      const qB = 'qb-' + Math.random().toString(36).slice(2);
      await stream.append(makeMessageData({queryId: qA}));
      await stream.append(makeMessageData({queryId: qA}));
      await stream.append(makeMessageData({queryId: qB}));

      await stream.deleteByQuery(qA);

      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0].data.queryId).toBe(qB);
    });

    it('is a no-op when no rows match', async () => {
      await stream.append(makeMessageData());
      await stream.deleteByQuery('nonexistent-query-id');
      expect(await stream.all()).toHaveLength(1);
    });
  });

  describe('distinctConversationIds', () => {
    it('returns empty array when stream is empty', async () => {
      expect(await stream.distinctConversationIds()).toEqual([]);
    });

    it('returns each conversation id once', async () => {
      const convA = 'conv-a-' + Math.random().toString(36).slice(2);
      const convB = 'conv-b-' + Math.random().toString(36).slice(2);
      await stream.append(makeMessageData({conversationId: convA}));
      await stream.append(makeMessageData({conversationId: convA}));
      await stream.append(makeMessageData({conversationId: convB}));

      const ids = await stream.distinctConversationIds();

      expect(ids.sort()).toEqual([convA, convB].sort());
    });
  });

  describe('conversationStats', () => {
    it('returns empty array when stream is empty', async () => {
      expect(await stream.conversationStats()).toEqual([]);
    });

    it('counts messages and distinct queries per conversation', async () => {
      const convA = 'conv-a-' + Math.random().toString(36).slice(2);
      const convB = 'conv-b-' + Math.random().toString(36).slice(2);
      const queryA1 = 'q-a1-' + Math.random().toString(36).slice(2);
      const queryA2 = 'q-a2-' + Math.random().toString(36).slice(2);
      const queryB1 = 'q-b1-' + Math.random().toString(36).slice(2);

      await stream.append(
        makeMessageData({conversationId: convA, queryId: queryA1})
      );
      await stream.append(
        makeMessageData({conversationId: convA, queryId: queryA1})
      );
      await stream.append(
        makeMessageData({conversationId: convA, queryId: queryA2})
      );
      await stream.append(
        makeMessageData({conversationId: convB, queryId: queryB1})
      );

      const stats = await stream.conversationStats();
      const byConversation = new Map(
        stats.map((stat) => [stat.conversationId, stat])
      );

      expect(byConversation.get(convA)).toEqual({
        conversationId: convA,
        messageCount: 3,
        queryCount: 2,
      });
      expect(byConversation.get(convB)).toEqual({
        conversationId: convB,
        messageCount: 1,
        queryCount: 1,
      });
    });

    it('excludes expired messages', async () => {
      const conversationId = 'conv-' + Math.random().toString(36).slice(2);
      await stream.append(makeMessageData({conversationId}), 1);
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(await stream.conversationStats()).toEqual([]);
    });
  });

  describe('getCurrentSequence', () => {
    it('returns 0 when stream is empty', async () => {
      expect(await stream.getCurrentSequence()).toBe(0);
    });

    it('returns last assigned sequence number', async () => {
      await stream.append(makeMessageData());
      await stream.append(makeMessageData());
      expect(await stream.getCurrentSequence()).toBe(2);
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('notifies subscriber for each append', async () => {
      const seqs: number[] = [];
      stream.subscribe((item) => seqs.push(item.sequenceNumber));
      await stream.append(makeMessageData());
      await stream.append(makeMessageData());
      expect(seqs).toEqual([1, 2]);
    });

    it('stops notifying after returned unsubscribe is called', async () => {
      const seqs: number[] = [];
      const unsubscribe = stream.subscribe((item) =>
        seqs.push(item.sequenceNumber)
      );
      await stream.append(makeMessageData());
      unsubscribe();
      await stream.append(makeMessageData());
      expect(seqs).toEqual([1]);
    });

    it('multiple subscribers all receive events', async () => {
      const a: number[] = [];
      const b: number[] = [];
      stream.subscribe((item) => a.push(item.sequenceNumber));
      stream.subscribe((item) => b.push(item.sequenceNumber));
      await stream.append(makeMessageData());
      expect(a).toEqual([1]);
      expect(b).toEqual([1]);
    });
  });

  describe('TTL', () => {
    const CLOCK_SKEW_MS = 100;

    it('uses constructor ttlSeconds as default expires_at', async () => {
      const before = Date.now();
      const item = await stream.append(makeMessageData());
      const after = Date.now();

      const pgDb = db();
      const rows = await pgDb<{expires_at: Date}[]>`
        SELECT expires_at FROM messages WHERE sequence_number = ${item.sequenceNumber}
      `;
      const expiresAt = rows[0]!.expires_at.getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(
        before - CLOCK_SKEW_MS + 3600 * 1000
      );
      expect(expiresAt).toBeLessThanOrEqual(after + 3600 * 1000 + 2000);
    });

    it('uses per-call ttlSeconds when provided', async () => {
      const customTtl = 60;
      const before = Date.now();
      const item = await stream.append(makeMessageData(), customTtl);
      const after = Date.now();

      const pgDb = db();
      const rows = await pgDb<{expires_at: Date}[]>`
        SELECT expires_at FROM messages WHERE sequence_number = ${item.sequenceNumber}
      `;
      const expiresAt = rows[0]!.expires_at.getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(
        before - CLOCK_SKEW_MS + customTtl * 1000
      );
      expect(expiresAt).toBeLessThanOrEqual(after + customTtl * 1000 + 2000);
    });

    it('expired items are invisible to all and getCurrentSequence', async () => {
      await stream.append(makeMessageData(), 1);
      expect(await stream.all()).toHaveLength(1);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(await stream.all()).toHaveLength(0);
      expect(await stream.getCurrentSequence()).toBe(0);
    });
  });
});
