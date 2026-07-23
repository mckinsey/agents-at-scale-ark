import {createLogger} from '@ark-broker/logging/logger.js';
import {InMemoryEventStream} from '../in-memory-event-stream.js';
import {makeEventData} from './testHelpers/event-data-factory.js';

const silentLogger = createLogger({level: 'silent', pretty: false});

describe('InMemoryEventStream', () => {
  let stream: InMemoryEventStream;

  beforeEach(() => {
    stream = new InMemoryEventStream(silentLogger, 'test-events');
  });

  describe('deleteByQuery', () => {
    it('removes only items with the given queryId', async () => {
      const eventA = makeEventData();
      eventA.data.queryId = 'query-a';
      const eventB = makeEventData();
      eventB.data.queryId = 'query-b';
      await stream.append(eventA);
      await stream.append({...eventA});
      await stream.append(eventB);

      await stream.deleteByQuery('query-a');

      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0].data.data.queryId).toBe('query-b');
    });

    it('is a no-op when no items match', async () => {
      await stream.append(makeEventData());
      await stream.deleteByQuery('nonexistent-query-id');
      expect(await stream.all()).toHaveLength(1);
    });
  });

  describe('filterBy', () => {
    it('returns only items matching queryId, in sequence order', async () => {
      const queryId = 'query-a';
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
      const sessionId = 'session-a';
      const event = makeEventData();
      event.data.sessionId = sessionId;
      const a = await stream.append(event);
      await stream.append(makeEventData());

      const result = await stream.filterBy({sessionId});

      expect(result).toHaveLength(1);
      expect(result[0]!.sequenceNumber).toBe(a.sequenceNumber);
    });

    it('applies afterSequence as a keyset cursor', async () => {
      const queryId = 'query-a';
      const eventA = makeEventData();
      eventA.data.queryId = queryId;
      const eventB = makeEventData();
      eventB.data.queryId = queryId;
      const a = await stream.append(eventA);
      const b = await stream.append(eventB);

      const result = await stream.filterBy({
        queryId,
        afterSequence: a.sequenceNumber,
      });

      expect(result.map((item) => item.sequenceNumber)).toEqual([
        b.sequenceNumber,
      ]);
    });
  });

  describe('paginateBy', () => {
    it('returns only items matching the filter', async () => {
      const queryId = 'query-a';
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

    it('applies the keyset cursor across pages', async () => {
      const queryId = 'query-a';
      const appended = [];
      for (let i = 0; i < 3; i++) {
        const event = makeEventData();
        event.data.queryId = queryId;
        appended.push(await stream.append(event));
      }

      const page1 = await stream.paginateBy({limit: 2}, {queryId});
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBe(appended[1]!.sequenceNumber);

      const page2 = await stream.paginateBy(
        {limit: 2, cursor: page1.nextCursor},
        {queryId}
      );
      expect(page2.items.map((item) => item.sequenceNumber)).toEqual([
        appended[2]!.sequenceNumber,
      ]);
      expect(page2.hasMore).toBe(false);
    });
  });

  describe('deleteBy', () => {
    it('removes only rows matching queryId, leaving others intact', async () => {
      const queryA = 'query-a';
      const queryB = 'query-b';
      const eventA = makeEventData();
      eventA.data.queryId = queryA;
      const eventB = makeEventData();
      eventB.data.queryId = queryB;
      await stream.append(eventA);
      const survivor = await stream.append(eventB);

      await stream.deleteBy({queryId: queryA});

      const all = await stream.all();
      expect(all).toHaveLength(1);
      expect(all[0]!.sequenceNumber).toBe(survivor.sequenceNumber);
    });

    it('removes only rows matching sessionId, leaving others intact', async () => {
      const sessionA = 'session-a';
      const sessionB = 'session-b';
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
});
