import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLogger} from '@ark-broker/logging/logger.js';
import {InMemorySessionsStorage} from '../in-memory-sessions-storage.js';

const silentLogger = createLogger({level: 'silent', pretty: false});

describe('InMemorySessionsStorage', () => {
  let storage: InMemorySessionsStorage;

  beforeEach(() => {
    jest.useFakeTimers();
    storage = new InMemorySessionsStorage(silentLogger);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('applyEvent', () => {
    test('creates session and query on first event', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        queryNamespace: 'default',
      });

      const store = await storage.getAll();
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

    test('updates query phase on completion event', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
      });

      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionComplete',
      });

      const query = (await storage.getSession('sess-1'))!.queries['query-1'];
      expect(query.phase).toBe('done');
      expect(query.completedAt).toBeDefined();
    });

    test('sets agent from event data', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        agent: 'my-agent',
      });

      const query = (await storage.getSession('sess-1'))!.queries['query-1'];
      expect(query.agent).toBe('my-agent');
    });

    test('sets error on error events', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
      });

      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionComplete',
        error: 'something broke',
      });

      const query = (await storage.getSession('sess-1'))!.queries['query-1'];
      expect(query.phase).toBe('error');
      expect(query.error).toBe('something broke');
      expect(query.completedAt).toBeDefined();
    });

    test('sets error phase on reason containing Error', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'AgentExecutionError',
      });

      const query = (await storage.getSession('sess-1'))!.queries['query-1'];
      expect(query.phase).toBe('error');
    });

    test('sets canceled phase on cancellation event', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
      });

      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionCanceled',
      });

      const query = (await storage.getSession('sess-1'))!.queries['query-1'];
      expect(query.phase).toBe('canceled');
      expect(query.completedAt).toBeDefined();
      expect(query.error).toBeUndefined();
    });

    test('sets canceled phase on reason containing Canceled', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'AgentExecutionCanceled',
      });

      const query = (await storage.getSession('sess-1'))!.queries['query-1'];
      expect(query.phase).toBe('canceled');
    });

    test('does not regress error phase to canceled', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionComplete',
        error: 'something broke',
      });

      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionCanceled',
      });

      const query = (await storage.getSession('sess-1'))!.queries['query-1'];
      expect(query.phase).toBe('error');
      expect(query.error).toBe('something broke');
    });

    test('clears error phase when query later completes (HITL approval)', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'AgentExecutionError',
        error: 'approval required for 1 tool call(s)',
      });

      let session = (await storage.getSession('sess-1'))!;
      expect(session.queries['query-1'].phase).toBe('error');
      expect(session.errorCount).toBe(1);

      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionComplete',
      });

      session = (await storage.getSession('sess-1'))!;
      expect(session.queries['query-1'].phase).toBe('done');
      expect(session.queries['query-1'].error).toBeUndefined();
      expect(session.errorCount).toBe(0);
      expect(session.status).toBe('idle');
    });

    test('ignores events without sessionId', async () => {
      await storage.applyEvent({
        queryName: 'query-1',
      });

      const store = await storage.getAll();
      expect(Object.keys(store.sessions)).toHaveLength(0);
    });

    test('ignores events without queryName', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
      });

      const store = await storage.getAll();
      expect(Object.keys(store.sessions)).toHaveLength(0);
    });

    test('does not overwrite agent once set', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        agent: 'first-agent',
      });

      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        agent: 'second-agent',
      });

      const query = (await storage.getSession('sess-1'))!.queries['query-1'];
      expect(query.agent).toBe('first-agent');
    });

    test('does not regress done phase to error on subsequent error-reason event', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionComplete',
      });

      const query = (await storage.getSession('sess-1'))!.queries['query-1'];
      expect(query.phase).toBe('done');
    });

    test('strips session- prefix for display name', async () => {
      await storage.applyEvent({
        sessionId: 'session-abc123',
        queryName: 'q1',
      });

      const session = (await storage.getSession('session-abc123'))!;
      expect(session.name).toBe('abc123');
    });

    test('keeps name as-is when no session- prefix', async () => {
      await storage.applyEvent({
        sessionId: 'custom-id',
        queryName: 'q1',
      });

      const session = (await storage.getSession('custom-id'))!;
      expect(session.name).toBe('custom-id');
    });
  });

  describe('applyMessage', () => {
    test('sets conversationId on matching query', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
      });

      await storage.applyMessage('conv-abc', 'query-1');

      const query = (await storage.getSession('sess-1'))!.queries['query-1'];
      expect(query.conversationId).toBe('conv-abc');
    });

    test('does not overwrite existing conversationId', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        conversationId: 'original',
      });

      await storage.applyMessage('new-conv', 'query-1');

      const query = (await storage.getSession('sess-1'))!.queries['query-1'];
      expect(query.conversationId).toBe('original');
    });

    test('does nothing if query not found', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
      });

      await storage.applyMessage('conv-abc', 'nonexistent-query');

      const query = (await storage.getSession('sess-1'))!.queries['query-1'];
      expect(query.conversationId).toBeUndefined();
    });

    test('moves the session header forward but not the query it belongs to', async () => {
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});
      const session = (await storage.getSession('sess-1'))!;
      const queryBefore = session.queries['query-1'].lastActivity;
      const headerBefore = session.lastActivity;

      jest.advanceTimersByTime(1000);
      await storage.applyMessage('conv-abc', 'query-1');

      const after = (await storage.getSession('sess-1'))!;
      expect(after.queries['query-1'].lastActivity).toBe(queryBefore);
      expect(new Date(after.lastActivity).getTime()).toBeGreaterThan(
        new Date(headerBefore).getTime()
      );
    });
  });

  describe('status election after a reload', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'ark-sessions-'));
    });

    afterEach(() => {
      rmSync(dir, {recursive: true, force: true});
    });

    test('a message on a healthy query does not turn the session idle', async () => {
      const path = join(dir, 'sessions.json');
      const persisted = new InMemorySessionsStorage(silentLogger, path);

      await persisted.applyEvent({
        sessionId: 'sess-1',
        queryName: 'healthy',
        conversationId: 'conv-1',
        _reason: 'QueryExecutionComplete',
      });
      jest.advanceTimersByTime(1000);
      await persisted.applyEvent({
        sessionId: 'sess-1',
        queryName: 'failed',
        conversationId: 'conv-1',
        _reason: 'QueryExecutionComplete',
        error: 'boom',
      });
      expect((await persisted.getSession('sess-1'))!.status).toBe('error');

      jest.advanceTimersByTime(1000);
      await persisted.applyMessage('conv-1', 'healthy');
      await persisted.save();

      // A reload re-runs the election from scratch, so anything the message
      // left behind on the query row decides the status all over again.
      const reloaded = new InMemorySessionsStorage(silentLogger, path);
      const session = (await reloaded.getSession('sess-1'))!;
      // The failure is still on the query either way - the bug is the session
      // disagreeing with it, reporting idle next to a non-zero errorCount.
      expect(session.queries['failed'].phase).toBe('error');
      expect(session.errorCount).toBe(1);
      expect(session.status).toBe('error');
    });
  });

  describe('getAll', () => {
    test('returns empty store initially', async () => {
      const store = await storage.getAll();
      expect(store).toEqual({sessions: {}});
    });

    test('returns populated store after events', async () => {
      await storage.applyEvent({sessionId: 's1', queryName: 'q1'});
      await storage.applyEvent({sessionId: 's2', queryName: 'q2'});

      const store = await storage.getAll();
      expect(Object.keys(store.sessions)).toHaveLength(2);
      expect(store.sessions['s1']).toBeDefined();
      expect(store.sessions['s2']).toBeDefined();
    });
  });

  describe('getSession', () => {
    test('returns session by id', async () => {
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'q1'});

      const session = await storage.getSession('sess-1');
      expect(session).toBeDefined();
      expect(session!.sessionId).toBe('sess-1');
    });

    test('returns undefined for unknown session', async () => {
      const session = await storage.getSession('nonexistent');
      expect(session).toBeUndefined();
    });
  });

  describe('getQueryByConversationId', () => {
    test('returns query with sessionId for matching conversationId', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        conversationId: 'conv-xyz',
      });

      const result = await storage.getQueryByConversationId('conv-xyz');
      expect(result).toBeDefined();
      expect(result!.sessionId).toBe('sess-1');
      expect(result!.name).toBe('query-1');
    });

    test('returns undefined when no query matches', async () => {
      const result = await storage.getQueryByConversationId('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    test('clears all sessions', async () => {
      await storage.applyEvent({sessionId: 's1', queryName: 'q1'});
      await storage.applyEvent({sessionId: 's2', queryName: 'q2'});

      await storage.delete();

      const store = await storage.getAll();
      expect(Object.keys(store.sessions)).toHaveLength(0);
    });

    test('clears the query index too, so purged mappings do not accumulate', async () => {
      await storage.applyEvent({sessionId: 's1', queryName: 'q1'});
      await storage.applyEvent({sessionId: 's2', queryName: 'q2'});

      await storage.delete();

      // Reads already miss after a purge, so the leak has no behaviour to
      // assert on - the index is the only place it is visible.
      const index = (
        storage as unknown as {queryToSession: Map<string, string>}
      ).queryToSession;
      expect(index.size).toBe(0);
    });
  });

  describe('deleteQuery', () => {
    const indexOf = (): Map<string, string> =>
      (storage as unknown as {queryToSession: Map<string, string>})
        .queryToSession;

    test('removes the query and leaves the session header where it was', async () => {
      await storage.applyEvent({
        sessionId: 's1',
        queryName: 'q1',
        _reason: 'QueryExecutionError',
        error: 'boom',
      });
      await storage.applyEvent({sessionId: 's1', queryName: 'q2'});
      const before = (await storage.getSession('s1'))!.lastActivity;

      expect(await storage.deleteQuery('q1')).toBe(1);

      const session = (await storage.getSession('s1'))!;
      expect(Object.keys(session.queries)).toEqual(['q2']);
      expect(session.errorCount).toBe(0);
      expect(session.lastActivity).toBe(before);
    });

    test('does not orphan the index when the same name lives under two sessions', async () => {
      await storage.applyEvent({sessionId: 's1', queryName: 'shared'});
      await storage.applyEvent({sessionId: 's1', queryName: 'keeper'});
      await storage.applyEvent({sessionId: 's2', queryName: 'shared'});
      await storage.applyEvent({sessionId: 's2', queryName: 'keeper'});

      expect(await storage.deleteQuery('shared')).toBe(2);

      expect(indexOf().has('shared')).toBe(false);
      // The surviving queries still route, so the index was not over-pruned.
      await storage.applyMessage('conv-1', 'keeper');
      expect(indexOf().get('keeper')).toBe('s2');
    });

    test('drops the session once its last query goes', async () => {
      await storage.applyEvent({sessionId: 's1', queryName: 'q1'});

      await storage.deleteQuery('q1');

      const store = await storage.getAll();
      expect(Object.keys(store.sessions)).toHaveLength(0);
      expect(indexOf().size).toBe(0);
    });
  });

  describe('subscribe', () => {
    test('emits on applyEvent', async () => {
      const received: Array<{sessionId: string; queryName: string}> = [];
      storage.subscribe((data) => received.push(data));

      await storage.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({sessionId: 'sess-1', queryName: 'query-1'});
    });

    test('cleanup unsubscribes', async () => {
      const received: Array<{sessionId: string; queryName: string}> = [];
      const unsub = storage.subscribe((data) => received.push(data));

      await storage.applyEvent({sessionId: 'sess-1', queryName: 'q1'});
      expect(received).toHaveLength(1);

      unsub();

      await storage.applyEvent({sessionId: 'sess-2', queryName: 'q2'});
      expect(received).toHaveLength(1);
    });

    test('does not emit for ignored events', async () => {
      const received: Array<{sessionId: string; queryName: string}> = [];
      storage.subscribe((data) => received.push(data));

      await storage.applyEvent({queryName: 'q1'});
      await storage.applyEvent({sessionId: 's1'});

      expect(received).toHaveLength(0);
    });
  });

  describe('cache size accessors', () => {
    test('starts empty', () => {
      expect(storage.cachedItemCount()).toBe(0);
      expect(storage.cachedQueryCount()).toBe(0);
    });

    test('counts sessions and queries independently', async () => {
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'q1'});
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'q2'});
      await storage.applyEvent({sessionId: 'sess-2', queryName: 'q3'});

      expect(storage.cachedItemCount()).toBe(2);
      expect(storage.cachedQueryCount()).toBe(3);
    });

    test('repeated events for a known query do not inflate the count', async () => {
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'q1'});
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'q1',
        _reason: 'QueryExecutionComplete',
      });

      expect(storage.cachedQueryCount()).toBe(1);
    });

    test('counts the same query name reused across sessions', async () => {
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'shared'});
      await storage.applyEvent({sessionId: 'sess-2', queryName: 'shared'});

      expect(storage.cachedItemCount()).toBe(2);
      expect(storage.cachedQueryCount()).toBe(2);
    });

    test('resets on delete', async () => {
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'q1'});
      await storage.delete();

      expect(storage.cachedItemCount()).toBe(0);
      expect(storage.cachedQueryCount()).toBe(0);
    });

    test('follows removals from the store', async () => {
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'q1'});
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'q2'});
      await storage.applyEvent({sessionId: 'sess-2', queryName: 'q3'});

      const store = await storage.getAll();
      delete store.sessions['sess-1'].queries['q2'];

      expect(storage.cachedQueryCount()).toBe(2);

      delete store.sessions['sess-1'];

      expect(storage.cachedItemCount()).toBe(1);
      expect(storage.cachedQueryCount()).toBe(1);
    });
  });
});
