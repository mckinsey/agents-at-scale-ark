import { SessionsBroker } from '../src/sessions-broker.js';

describe('SessionsBroker', () => {
  let broker: SessionsBroker;

  beforeEach(() => {
    jest.useFakeTimers();
    broker = new SessionsBroker();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('applyEvent', () => {
    test('creates session and query on first event', () => {
      broker.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        queryNamespace: 'default',
      });

      const store = broker.getAll();
      expect(Object.keys(store.sessions)).toHaveLength(1);

      const session = store.sessions['sess-1'];
      expect(session).toBeDefined();
      expect(session.sessionId).toBe('sess-1');
      expect(Object.keys(session.queries)).toHaveLength(1);

      const query = session.queries['query-1'];
      expect(query.name).toBe('query-1');
      expect(query.namespace).toBe('default');
      expect(query.phase).toBe('running');
      expect(query.targetType).toBe('agent');
    });

    test('updates query phase on completion event', () => {
      broker.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
      });

      broker.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionComplete',
      });

      const query = broker.getSession('sess-1')!.queries['query-1'];
      expect(query.phase).toBe('done');
      expect(query.completedAt).toBeDefined();
    });

    test('sets agent from event data', () => {
      broker.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        agent: 'my-agent',
      });

      const query = broker.getSession('sess-1')!.queries['query-1'];
      expect(query.agent).toBe('my-agent');
    });

    test('sets error on error events', () => {
      broker.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
      });

      broker.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionComplete',
        error: 'something broke',
      });

      const query = broker.getSession('sess-1')!.queries['query-1'];
      expect(query.phase).toBe('error');
      expect(query.error).toBe('something broke');
      expect(query.completedAt).toBeDefined();
    });

    test('sets error phase on reason containing Error', () => {
      broker.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'AgentExecutionError',
      });

      const query = broker.getSession('sess-1')!.queries['query-1'];
      expect(query.phase).toBe('error');
    });

    test('ignores events without sessionId', () => {
      broker.applyEvent({
        queryName: 'query-1',
      });

      const store = broker.getAll();
      expect(Object.keys(store.sessions)).toHaveLength(0);
    });

    test('ignores events without queryName', () => {
      broker.applyEvent({
        sessionId: 'sess-1',
      });

      const store = broker.getAll();
      expect(Object.keys(store.sessions)).toHaveLength(0);
    });

    test('does not overwrite agent once set', () => {
      broker.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        agent: 'first-agent',
      });

      broker.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        agent: 'second-agent',
      });

      const query = broker.getSession('sess-1')!.queries['query-1'];
      expect(query.agent).toBe('first-agent');
    });

    test('does not regress done phase to error on subsequent error-reason event', () => {
      broker.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionComplete',
      });

      const query = broker.getSession('sess-1')!.queries['query-1'];
      expect(query.phase).toBe('done');
    });

    test('strips session- prefix for display name', () => {
      broker.applyEvent({
        sessionId: 'session-abc123',
        queryName: 'q1',
      });

      const session = broker.getSession('session-abc123')!;
      expect(session.name).toBe('abc123');
    });

    test('keeps name as-is when no session- prefix', () => {
      broker.applyEvent({
        sessionId: 'custom-id',
        queryName: 'q1',
      });

      const session = broker.getSession('custom-id')!;
      expect(session.name).toBe('custom-id');
    });
  });

  describe('applyMessage', () => {
    test('sets conversationId on matching query', () => {
      broker.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
      });

      broker.applyMessage('conv-abc', 'query-1');

      const query = broker.getSession('sess-1')!.queries['query-1'];
      expect(query.conversationId).toBe('conv-abc');
    });

    test('does not overwrite existing conversationId', () => {
      broker.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        conversationId: 'original',
      });

      broker.applyMessage('new-conv', 'query-1');

      const query = broker.getSession('sess-1')!.queries['query-1'];
      expect(query.conversationId).toBe('original');
    });

    test('does nothing if query not found', () => {
      broker.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
      });

      broker.applyMessage('conv-abc', 'nonexistent-query');

      const query = broker.getSession('sess-1')!.queries['query-1'];
      expect(query.conversationId).toBeUndefined();
    });
  });

  describe('getAll', () => {
    test('returns empty store initially', () => {
      const store = broker.getAll();
      expect(store).toEqual({ sessions: {} });
    });

    test('returns populated store after events', () => {
      broker.applyEvent({ sessionId: 's1', queryName: 'q1' });
      broker.applyEvent({ sessionId: 's2', queryName: 'q2' });

      const store = broker.getAll();
      expect(Object.keys(store.sessions)).toHaveLength(2);
      expect(store.sessions['s1']).toBeDefined();
      expect(store.sessions['s2']).toBeDefined();
    });
  });

  describe('getSession', () => {
    test('returns session by id', () => {
      broker.applyEvent({ sessionId: 'sess-1', queryName: 'q1' });

      const session = broker.getSession('sess-1');
      expect(session).toBeDefined();
      expect(session!.sessionId).toBe('sess-1');
    });

    test('returns undefined for unknown session', () => {
      const session = broker.getSession('nonexistent');
      expect(session).toBeUndefined();
    });
  });

  describe('getQueryByConversationId', () => {
    test('returns query with sessionId for matching conversationId', () => {
      broker.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        conversationId: 'conv-xyz',
      });

      const result = broker.getQueryByConversationId('conv-xyz');
      expect(result).toBeDefined();
      expect(result!.sessionId).toBe('sess-1');
      expect(result!.name).toBe('query-1');
    });

    test('returns undefined when no query matches', () => {
      const result = broker.getQueryByConversationId('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    test('clears all sessions', () => {
      broker.applyEvent({ sessionId: 's1', queryName: 'q1' });
      broker.applyEvent({ sessionId: 's2', queryName: 'q2' });

      broker.delete();

      const store = broker.getAll();
      expect(Object.keys(store.sessions)).toHaveLength(0);
    });
  });

  describe('subscribe', () => {
    test('emits on applyEvent', () => {
      const received: Array<{ sessionId: string; queryName: string }> = [];
      broker.subscribe((data) => received.push(data));

      broker.applyEvent({ sessionId: 'sess-1', queryName: 'query-1' });

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ sessionId: 'sess-1', queryName: 'query-1' });
    });

    test('cleanup unsubscribes', () => {
      const received: Array<{ sessionId: string; queryName: string }> = [];
      const unsub = broker.subscribe((data) => received.push(data));

      broker.applyEvent({ sessionId: 'sess-1', queryName: 'q1' });
      expect(received).toHaveLength(1);

      unsub();

      broker.applyEvent({ sessionId: 'sess-2', queryName: 'q2' });
      expect(received).toHaveLength(1);
    });

    test('does not emit for ignored events', () => {
      const received: Array<{ sessionId: string; queryName: string }> = [];
      broker.subscribe((data) => received.push(data));

      broker.applyEvent({ queryName: 'q1' });
      broker.applyEvent({ sessionId: 's1' });

      expect(received).toHaveLength(0);
    });
  });
});
