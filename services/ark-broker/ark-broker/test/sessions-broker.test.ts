import {createLogger} from '../src/logging/logger.js';
import {SessionsBroker} from '../src/brokers/sessions-broker.js';
import {InMemorySessionsStorage} from '../src/brokers/sessions/in-memory-sessions-storage.js';

const silentLogger = createLogger({level: 'silent', pretty: false});

describe('SessionsBroker', () => {
  let broker: SessionsBroker;

  beforeEach(() => {
    broker = new SessionsBroker(new InMemorySessionsStorage(silentLogger));
  });

  test('delegates applyEvent and getSession to the underlying storage', async () => {
    await broker.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});

    const session = await broker.getSession('sess-1');
    expect(session).toBeDefined();
    expect(session!.queries['query-1']).toBeDefined();
  });

  test('delegates applyMessage', async () => {
    await broker.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});
    await broker.applyMessage('conv-abc', 'query-1');

    const session = await broker.getSession('sess-1');
    expect(session!.queries['query-1'].conversationId).toBe('conv-abc');
  });

  test('delegates getAll', async () => {
    await broker.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});

    const store = await broker.getAll();
    expect(Object.keys(store.sessions)).toEqual(['sess-1']);
  });

  test('delegates paginate', async () => {
    await broker.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});

    const result = await broker.paginate({limit: 10});
    expect(result.total).toBe(1);
    expect(result.items[0].sessionId).toBe('sess-1');
  });

  test('delegates getQueryByConversationId', async () => {
    await broker.applyEvent({
      sessionId: 'sess-1',
      queryName: 'query-1',
      conversationId: 'conv-xyz',
    });

    const result = await broker.getQueryByConversationId('conv-xyz');
    expect(result?.sessionId).toBe('sess-1');
  });

  test('delegates delete', async () => {
    await broker.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});
    await broker.delete();

    const store = await broker.getAll();
    expect(Object.keys(store.sessions)).toHaveLength(0);
  });

  test('delegates subscribe', async () => {
    const received: Array<{sessionId: string; queryName: string}> = [];
    broker.subscribe((data) => received.push(data));

    await broker.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});

    expect(received).toEqual([{sessionId: 'sess-1', queryName: 'query-1'}]);
  });
});
