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
});
