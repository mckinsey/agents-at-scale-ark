import {createLogger} from '@ark-broker/logging/logger.js';
import {usePgContainer} from '../../../db/__tests__/testHelpers/pg-testcontainer.js';
import {PostgresEventStream} from '../postgres-event-stream.js';
import {makeEventData} from './testHelpers/event-data-factory.js';

jest.setTimeout(120_000);

const silentLogger = createLogger({level: 'silent', pretty: false});

describe('PostgresEventStream', () => {
  const {db} = usePgContainer();
  let stream: PostgresEventStream;

  beforeAll(() => {
    stream = new PostgresEventStream(silentLogger, db(), 3600);
  });

  describe('append', () => {
    it('assigns sequenceNumber starting at 1', async () => {
      const item = await stream.append(makeEventData());
      expect(item.sequenceNumber).toBe(1);
    });

    it('increments sequenceNumber monotonically', async () => {
      const a = await stream.append(makeEventData());
      const b = await stream.append(makeEventData());
      const c = await stream.append(makeEventData());
      expect(a.sequenceNumber).toBe(1);
      expect(b.sequenceNumber).toBe(2);
      expect(c.sequenceNumber).toBe(3);
    });

    it('returns item with timestamp as Date', async () => {
      const item = await stream.append(makeEventData());
      expect(item.timestamp).toBeInstanceOf(Date);
    });

    it('round-trips EventData through JSONB', async () => {
      const event = makeEventData({eventType: 'AgentExecutionStart'});
      const item = await stream.append(event);
      expect(item.data.eventType).toBe('AgentExecutionStart');
      expect(item.data.data.queryId).toBe(event.data.queryId);
    });

    it('fires subscribe callback during append', async () => {
      const received: number[] = [];
      stream.subscribe((item) => received.push(item.sequenceNumber));
      await stream.append(makeEventData());
      expect(received).toHaveLength(1);
    });
  });

  describe('all', () => {
    it('returns empty array initially', async () => {
      expect(await stream.all()).toEqual([]);
    });

    it('returns all appended items in order', async () => {
      await stream.append(makeEventData());
      await stream.append(makeEventData());
      const all = await stream.all();
      expect(all).toHaveLength(2);
      expect(all[0].sequenceNumber).toBe(1);
      expect(all[1].sequenceNumber).toBe(2);
    });
  });

  describe('filter', () => {
    it('returns only matching items', async () => {
      const a = await stream.append(makeEventData());
      await stream.append(makeEventData());
      const result = await stream.filter(
        (item) => item.sequenceNumber === a.sequenceNumber
      );
      expect(result).toHaveLength(1);
      expect(result[0].sequenceNumber).toBe(a.sequenceNumber);
    });

    it('filters by queryId via EventData.data.queryId', async () => {
      const target = 'q-' + Math.random().toString(36).slice(2);
      const event = makeEventData();
      event.data.queryId = target;
      await stream.append(event);
      await stream.append(makeEventData());

      const result = await stream.filter(
        (item) => item.data.data.queryId === target
      );
      expect(result).toHaveLength(1);
      expect(result[0].data.data.queryId).toBe(target);
    });
  });

  describe('paginate', () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        await stream.append(makeEventData());
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
      await stream.append(makeEventData());
      await stream.append(makeEventData());
      await stream.delete();
      expect(await stream.all()).toHaveLength(0);
      const next = await stream.append(makeEventData());
      expect(next.sequenceNumber).toBe(3);
    });

    it('removes only matching items when predicate is provided', async () => {
      const a = await stream.append(makeEventData());
      await stream.append(makeEventData());
      await stream.delete((item) => item.sequenceNumber === a.sequenceNumber);
      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0].sequenceNumber).toBe(2);
    });
  });

  describe('filterBy', () => {
    it('returns only items matching queryId, in sequence order', async () => {
      const queryId = 'q-' + Math.random().toString(36).slice(2);
      const eventA = makeEventData();
      eventA.data.queryId = queryId;
      const eventB = makeEventData();
      eventB.data.queryId = queryId;
      const a = await stream.append(eventA);
      const b = await stream.append(eventB);
      await stream.append(makeEventData());

      const result = await stream.filterBy({queryId});

      expect(result.map((item) => item.sequenceNumber)).toEqual([
        a.sequenceNumber,
        b.sequenceNumber,
      ]);
    });

    it('returns only items matching sessionId', async () => {
      const sessionId = 's-' + Math.random().toString(36).slice(2);
      const event = makeEventData();
      event.data.sessionId = sessionId;
      const a = await stream.append(event);
      await stream.append(makeEventData());

      const result = await stream.filterBy({sessionId});

      expect(result).toHaveLength(1);
      expect(result[0]!.sequenceNumber).toBe(a.sequenceNumber);
    });

    it('combines queryId and sessionId as AND', async () => {
      const queryId = 'q-' + Math.random().toString(36).slice(2);
      const sessionId = 's-' + Math.random().toString(36).slice(2);
      const matching = makeEventData();
      matching.data.queryId = queryId;
      matching.data.sessionId = sessionId;
      const match = await stream.append(matching);

      const onlyQuery = makeEventData();
      onlyQuery.data.queryId = queryId;
      await stream.append(onlyQuery);

      const onlySession = makeEventData();
      onlySession.data.sessionId = sessionId;
      await stream.append(onlySession);

      const result = await stream.filterBy({queryId, sessionId});

      expect(result).toHaveLength(1);
      expect(result[0]!.sequenceNumber).toBe(match.sequenceNumber);
    });

    it('returns empty array when nothing matches', async () => {
      await stream.append(makeEventData());
      const result = await stream.filterBy({queryId: 'nonexistent-query-id'});
      expect(result).toHaveLength(0);
    });

    it('applies afterSequence as a keyset cursor', async () => {
      const queryId = 'q-' + Math.random().toString(36).slice(2);
      const eventA = makeEventData();
      eventA.data.queryId = queryId;
      const eventB = makeEventData();
      eventB.data.queryId = queryId;
      const eventC = makeEventData();
      eventC.data.queryId = queryId;
      const a = await stream.append(eventA);
      const b = await stream.append(eventB);
      const c = await stream.append(eventC);

      const result = await stream.filterBy({
        queryId,
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
      const queryId = 'q-' + Math.random().toString(36).slice(2);
      const eventA = makeEventData();
      eventA.data.queryId = queryId;
      const eventB = makeEventData();
      eventB.data.queryId = queryId;
      await stream.append(eventA);
      await stream.append(eventB);
      await stream.append(makeEventData());

      const result = await stream.paginateBy({limit: 10}, {queryId});

      expect(result.items).toHaveLength(2);
      expect(
        result.items.every((item) => item.data.data.queryId === queryId)
      ).toBe(true);
    });

    it('paginates a filtered subset across multiple keyset pages', async () => {
      const queryId = 'q-' + Math.random().toString(36).slice(2);
      const appended = [];
      for (let i = 0; i < 5; i++) {
        const event = makeEventData();
        event.data.queryId = queryId;
        appended.push(await stream.append(event));
      }
      await stream.append(makeEventData());

      const page1 = await stream.paginateBy({limit: 2}, {queryId});
      expect(page1.items.map((item) => item.sequenceNumber)).toEqual([
        appended[0]!.sequenceNumber,
        appended[1]!.sequenceNumber,
      ]);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBe(appended[1]!.sequenceNumber);

      const page2 = await stream.paginateBy(
        {limit: 2, cursor: page1.nextCursor},
        {queryId}
      );
      expect(page2.items.map((item) => item.sequenceNumber)).toEqual([
        appended[2]!.sequenceNumber,
        appended[3]!.sequenceNumber,
      ]);
      expect(page2.hasMore).toBe(true);

      const page3 = await stream.paginateBy(
        {limit: 2, cursor: page2.nextCursor},
        {queryId}
      );
      expect(page3.items.map((item) => item.sequenceNumber)).toEqual([
        appended[4]!.sequenceNumber,
      ]);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextCursor).toBeUndefined();
    });

    it('works without a filter, mirroring paginate', async () => {
      for (let i = 0; i < 3; i++) {
        await stream.append(makeEventData());
      }
      const result = await stream.paginateBy({limit: 10});
      expect(result.items).toHaveLength(3);
    });
  });

  describe('deleteBy', () => {
    it('removes only rows matching queryId, leaving others intact', async () => {
      const queryA = 'q-a-' + Math.random().toString(36).slice(2);
      const queryB = 'q-b-' + Math.random().toString(36).slice(2);
      const eventA = makeEventData();
      eventA.data.queryId = queryA;
      const eventB = makeEventData();
      eventB.data.queryId = queryB;
      await stream.append(eventA);
      await stream.append({...eventA});
      const survivor = await stream.append(eventB);

      await stream.deleteBy({queryId: queryA});

      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0]!.sequenceNumber).toBe(survivor.sequenceNumber);
    });

    it('removes only rows matching sessionId, leaving others intact', async () => {
      const sessionA = 's-a-' + Math.random().toString(36).slice(2);
      const sessionB = 's-b-' + Math.random().toString(36).slice(2);
      const eventA = makeEventData();
      eventA.data.sessionId = sessionA;
      const eventB = makeEventData();
      eventB.data.sessionId = sessionB;
      await stream.append(eventA);
      const survivor = await stream.append(eventB);

      await stream.deleteBy({sessionId: sessionA});

      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0]!.sequenceNumber).toBe(survivor.sequenceNumber);
    });

    it('removes rows regardless of expiry (ignores TTL)', async () => {
      const queryId = 'q-' + Math.random().toString(36).slice(2);
      const event = makeEventData();
      event.data.queryId = queryId;
      const item = await stream.append(event, 1);
      await new Promise((resolve) => setTimeout(resolve, 1500));

      await stream.deleteBy({queryId});

      const pgDb = db();
      const rows = await pgDb`
        SELECT sequence_number FROM events WHERE sequence_number = ${item.sequenceNumber}
      `;
      expect(rows).toHaveLength(0);
    });

    it('rejects an empty filter without deleting anything', async () => {
      await stream.append(makeEventData());
      await expect(stream.deleteBy({})).rejects.toThrow();
      expect(await stream.all()).toHaveLength(1);
    });

    it('rejects an empty-string queryId without deleting anything', async () => {
      await stream.append(makeEventData());
      await expect(stream.deleteBy({queryId: ''})).rejects.toThrow();
      expect(await stream.all()).toHaveLength(1);
    });

    it('rejects an empty-string sessionId without deleting anything', async () => {
      await stream.append(makeEventData());
      await expect(stream.deleteBy({sessionId: ''})).rejects.toThrow();
      expect(await stream.all()).toHaveLength(1);
    });
  });

  describe('deleteByQuery', () => {
    it('removes only rows with the given query_id', async () => {
      const qA = 'qa-' + Math.random().toString(36).slice(2);
      const qB = 'qb-' + Math.random().toString(36).slice(2);
      const eventA = makeEventData();
      eventA.data.queryId = qA;
      const eventB = makeEventData();
      eventB.data.queryId = qB;
      await stream.append(eventA);
      await stream.append({...eventA});
      await stream.append(eventB);

      await stream.deleteByQuery(qA);

      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0].data.data.queryId).toBe(qB);
    });

    it('is a no-op when no rows match', async () => {
      await stream.append(makeEventData());
      await stream.deleteByQuery('nonexistent-query-id');
      expect(await stream.all()).toHaveLength(1);
    });
  });

  describe('getCurrentSequence', () => {
    it('returns 0 when stream is empty', async () => {
      expect(await stream.getCurrentSequence()).toBe(0);
    });

    it('returns last assigned sequence number', async () => {
      await stream.append(makeEventData());
      await stream.append(makeEventData());
      expect(await stream.getCurrentSequence()).toBe(2);
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('notifies subscriber for each append', async () => {
      const seqs: number[] = [];
      stream.subscribe((item) => seqs.push(item.sequenceNumber));
      await stream.append(makeEventData());
      await stream.append(makeEventData());
      expect(seqs).toEqual([1, 2]);
    });

    it('stops notifying after returned unsubscribe is called', async () => {
      const seqs: number[] = [];
      const unsubscribe = stream.subscribe((item) =>
        seqs.push(item.sequenceNumber)
      );
      await stream.append(makeEventData());
      unsubscribe();
      await stream.append(makeEventData());
      expect(seqs).toEqual([1]);
    });
  });

  describe('TTL', () => {
    const CLOCK_SKEW_MS = 100;

    it('uses constructor ttlSeconds as default expires_at', async () => {
      const before = Date.now();
      const item = await stream.append(makeEventData());
      const after = Date.now();

      const pgDb = db();
      const rows = await pgDb<{expires_at: Date}[]>`
        SELECT expires_at FROM events WHERE sequence_number = ${item.sequenceNumber}
      `;
      const expiresAt = rows[0]!.expires_at.getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(
        before - CLOCK_SKEW_MS + 3600 * 1000
      );
      expect(expiresAt).toBeLessThanOrEqual(after + 3600 * 1000 + 2000);
    });

    it('expired items are invisible to all and getCurrentSequence', async () => {
      await stream.append(makeEventData(), 1);
      expect(await stream.all()).toHaveLength(1);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(await stream.all()).toHaveLength(0);
      expect(await stream.getCurrentSequence()).toBe(0);
    });
  });
});
