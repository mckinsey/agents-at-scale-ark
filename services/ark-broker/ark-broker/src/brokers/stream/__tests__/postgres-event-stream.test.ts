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
