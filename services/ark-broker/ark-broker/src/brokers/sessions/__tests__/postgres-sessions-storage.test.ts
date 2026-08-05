import type postgres from 'postgres';
import {createLogger} from '@ark-broker/logging/logger.js';
import type {ConversationSummary} from '../../sessions-broker.js';
import {usePgContainer} from '../../../db/__tests__/testHelpers/pg-testcontainer.js';
import {sleep} from './testHelpers/sleep.js';
import {InMemorySessionsStorage} from '../in-memory-sessions-storage.js';
import {PostgresSessionsStorage} from '../postgres-sessions-storage.js';

jest.setTimeout(120_000);

const silentLogger = createLogger({level: 'silent', pretty: false});

describe('PostgresSessionsStorage', () => {
  const {db} = usePgContainer();
  let storage: PostgresSessionsStorage;

  beforeEach(() => {
    storage = new PostgresSessionsStorage(silentLogger, db(), 3600);
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

      const session = store.sessions['sess-1']!;
      expect(session.sessionId).toBe('sess-1');
      expect(Object.keys(session.queries)).toHaveLength(1);

      const query = session.queries['query-1']!;
      expect(query.name).toBe('query-1');
      expect(query.namespace).toBe('default');
      expect(query.phase).toBe('running');
      expect(query.targetType).toBe('agent');
    });

    test('updates query phase on completion event', async () => {
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionComplete',
      });

      const query = (await storage.getSession('sess-1'))!.queries['query-1']!;
      expect(query.phase).toBe('done');
      expect(query.completedAt).toBeDefined();
    });

    test('sets error on error events and increments session errorCount', async () => {
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionComplete',
        error: 'something broke',
      });

      const session = (await storage.getSession('sess-1'))!;
      const query = session.queries['query-1']!;
      expect(query.phase).toBe('error');
      expect(query.error).toBe('something broke');
      expect(session.errorCount).toBe(1);
      expect(session.status).toBe('error');
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

      const query = (await storage.getSession('sess-1'))!.queries['query-1']!;
      expect(query.phase).toBe('error');
      expect(query.error).toBe('something broke');
    });

    test('clears error phase when query later completes (HITL approval) and drops session errorCount/status', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'AgentExecutionError',
        error: 'approval required for 1 tool call(s)',
      });

      let session = (await storage.getSession('sess-1'))!;
      expect(session.queries['query-1']!.phase).toBe('error');
      expect(session.errorCount).toBe(1);
      expect(session.status).toBe('error');

      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionComplete',
      });

      session = (await storage.getSession('sess-1'))!;
      expect(session.queries['query-1']!.phase).toBe('done');
      expect(session.queries['query-1']!.error).toBeUndefined();
      expect(session.errorCount).toBe(0);
      expect(session.status).toBe('idle');
    });

    test('status is active while a query is running, then idle once it completes', async () => {
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});
      expect((await storage.getSession('sess-1'))!.status).toBe('active');

      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionComplete',
      });
      expect((await storage.getSession('sess-1'))!.status).toBe('idle');
    });

    test('ignores events without sessionId or queryName', async () => {
      await storage.applyEvent({queryName: 'query-1'});
      await storage.applyEvent({sessionId: 'sess-1'});

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

      const query = (await storage.getSession('sess-1'))!.queries['query-1']!;
      expect(query.agent).toBe('first-agent');
    });

    test('strips session- prefix for display name', async () => {
      await storage.applyEvent({sessionId: 'session-abc123', queryName: 'q1'});
      const session = (await storage.getSession('session-abc123'))!;
      expect(session.name).toBe('abc123');
    });
  });

  describe('conversations aggregate', () => {
    test('first conversation ever appended to a new session does not break conversations/participants', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        conversationId: 'conv-1',
        agent: 'agent-a',
      });

      const session = (await storage.getSession('sess-1'))!;
      expect(session.conversations).toEqual([
        expect.objectContaining({
          conversationId: 'conv-1',
          name: 'agent-a',
          messageCount: 1,
          errorCount: 0,
        }),
      ]);
      expect(session.participants).toEqual([
        {id: 'agent-a', name: 'agent-a', type: 'agent'},
      ]);
    });

    test('two different queries in the same conversation aggregate messageCount/errorCount correctly', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        conversationId: 'conv-1',
        agent: 'agent-a',
      });
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-2',
        conversationId: 'conv-1',
        agent: 'agent-a',
        _reason: 'QueryExecutionComplete',
        error: 'boom',
      });

      const session = (await storage.getSession('sess-1'))!;
      expect(session.conversations).toHaveLength(1);
      const conv = session.conversations![0]!;
      expect(conv.messageCount).toBe(2);
      expect(conv.errorCount).toBe(1);
      expect(session.errorCount).toBe(1);
    });

    test('a second event for the same query in the same conversation does not double-count messageCount', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        conversationId: 'conv-1',
        agent: 'agent-a',
      });
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        conversationId: 'conv-1',
        agent: 'agent-a',
        _reason: 'QueryExecutionComplete',
      });

      const session = (await storage.getSession('sess-1'))!;
      expect(session.conversations).toHaveLength(1);
      expect(session.conversations![0]!.messageCount).toBe(1);
    });

    test('multiple queries across multiple sessions and conversations aggregate independently', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'q1',
        conversationId: 'conv-1',
        agent: 'agent-a',
      });
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'q2',
        conversationId: 'conv-2',
        team: 'team-b',
        targetType: 'team',
      });
      await storage.applyEvent({
        sessionId: 'sess-2',
        queryName: 'q3',
        conversationId: 'conv-3',
        tool: 'tool-c',
        targetType: 'tool',
      });

      const session1 = (await storage.getSession('sess-1'))!;
      expect(session1.conversations).toHaveLength(2);
      expect(
        session1
          .participants!.map((p) => ({name: p.name, type: p.type}))
          .sort((a, b) => a.name.localeCompare(b.name))
      ).toEqual([
        {name: 'agent-a', type: 'agent'},
        {name: 'team-b', type: 'team'},
      ]);

      const session2 = (await storage.getSession('sess-2'))!;
      expect(session2.conversations).toHaveLength(1);
      expect(session2.participants).toEqual([
        {id: 'tool-c', name: 'tool-c', type: 'tool'},
      ]);
    });
  });

  describe('applyMessage', () => {
    test('sets conversationId on matching query', async () => {
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});
      await storage.applyMessage('conv-abc', 'query-1');

      const query = (await storage.getSession('sess-1'))!.queries['query-1']!;
      expect(query.conversationId).toBe('conv-abc');
    });

    test('does not overwrite existing conversationId', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        conversationId: 'original',
      });
      await storage.applyMessage('new-conv', 'query-1');

      const query = (await storage.getSession('sess-1'))!.queries['query-1']!;
      expect(query.conversationId).toBe('original');
    });

    test('both write paths revive an expired session and extend its TTL', async () => {
      // expires_at hides a session from reads; it does not delete it, and no
      // reaper removes it yet. A write path that refused to touch an expired row
      // would therefore discard real work for as long as that row sits there -
      // for an event, a brand-new query under a recycled session id. So every
      // write revives, and the two paths have to agree on that.
      const expire = async (): Promise<void> => {
        await db()`
          UPDATE sessions SET expires_at = now() - interval '1 second'
          WHERE session_id = 'sess-1'
        `;
      };

      await storage.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});

      await expire();
      expect(await storage.getSession('sess-1')).toBeUndefined();
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'query-2'});
      expect(await storage.getSession('sess-1')).toBeDefined();

      await expire();
      expect(await storage.getSession('sess-1')).toBeUndefined();
      await storage.applyMessage('conv-1', 'query-1');
      const revived = await storage.getSession('sess-1');
      expect(revived).toBeDefined();
      expect(revived!.queries['query-1']!.conversationId).toBe('conv-1');
    });

    test('a message prefers a live owner over an expired one', async () => {
      // Reviving is the right answer only when every owner is expired. Two
      // sessions can hold the same query_id - nothing removes session_queries
      // rows when a Query is deleted, so recreating a Query under the same name
      // leaves the old row behind - and handing the message to the dead session
      // would both lose the live session's conversation and pop the dead one
      // back into the sessions list. 'a-old' sorts first, so plain session_id
      // ordering picks exactly the wrong row.
      await storage.applyEvent({sessionId: 'a-old', queryName: 'chat'});
      await storage.applyEvent({sessionId: 'z-new', queryName: 'chat'});
      await db()`
        UPDATE sessions SET expires_at = now() - interval '1 second'
        WHERE session_id = 'a-old'
      `;

      await storage.applyMessage('conv-live', 'chat');

      const live = (await storage.getSession('z-new'))!;
      expect(live.queries['chat']!.conversationId).toBe('conv-live');
      expect(live.conversations).toHaveLength(1);
      expect(await storage.getSession('a-old')).toBeUndefined();
    });

    test('does nothing if query not found', async () => {
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});
      await storage.applyMessage('conv-abc', 'nonexistent-query');

      const query = (await storage.getSession('sess-1'))!.queries['query-1']!;
      expect(query.conversationId).toBeUndefined();
    });

    test('newly assigning a conversationId via a message patches conversations/participants', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        agent: 'agent-a',
      });
      await storage.applyMessage('conv-abc', 'query-1');

      const session = (await storage.getSession('sess-1'))!;
      expect(session.conversations).toHaveLength(1);
      expect(session.conversations![0]!.conversationId).toBe('conv-abc');
      expect(session.conversations![0]!.messageCount).toBe(1);
    });

    test('emits when a message attaches the query to a conversation', async () => {
      await storage.whenListening();
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});
      // Let applyEvent's own notification land before subscribing, so it
      // can't be mistaken for one fired by the applyMessage call below.
      await sleep(200);

      const received: Array<{sessionId: string; queryName: string}> = [];
      storage.subscribe((data) => received.push(data));
      await storage.applyMessage('conv-abc', 'query-1');
      await sleep(200);

      // The conversation list changed, so a watcher that was not told would
      // keep serving the previous one.
      expect(received).toEqual([{sessionId: 'sess-1', queryName: 'query-1'}]);

      // ...but a message that changes nothing stays quiet.
      received.length = 0;
      await storage.applyMessage('conv-ignored', 'query-1');
      await sleep(200);
      expect(received).toHaveLength(0);
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

    test('excludes queries belonging to an expired session', async () => {
      const shortLived = new PostgresSessionsStorage(silentLogger, db(), 1);
      await shortLived.applyEvent({
        sessionId: 'sess-expiring',
        queryName: 'query-1',
        conversationId: 'conv-expiring',
      });

      await sleep(1500);

      const result = await storage.getQueryByConversationId('conv-expiring');
      expect(result).toBeUndefined();
    });
  });

  describe('getSession / getAll', () => {
    test('getSession returns undefined for unknown session', async () => {
      expect(await storage.getSession('nonexistent')).toBeUndefined();
    });

    test('getSession returns undefined for an expired session', async () => {
      const shortLived = new PostgresSessionsStorage(silentLogger, db(), 1);
      await shortLived.applyEvent({sessionId: 'sess-1', queryName: 'q1'});
      await sleep(1500);

      expect(await storage.getSession('sess-1')).toBeUndefined();
    });

    test('getAll returns empty store initially', async () => {
      expect(await storage.getAll()).toEqual({sessions: {}});
    });

    test('getAll returns populated store with nested queries after events', async () => {
      await storage.applyEvent({sessionId: 's1', queryName: 'q1'});
      await storage.applyEvent({sessionId: 's2', queryName: 'q2'});

      const store = await storage.getAll();
      expect(Object.keys(store.sessions)).toHaveLength(2);
      expect(store.sessions['s1']!.queries['q1']).toBeDefined();
      expect(store.sessions['s2']!.queries['q2']).toBeDefined();
    });

    test('getAll drops expired sessions and their queries', async () => {
      await storage.applyEvent({sessionId: 'live', queryName: 'q1'});
      await storage.applyEvent({sessionId: 'stale', queryName: 'q2'});
      await db()`
        UPDATE sessions SET expires_at = now() - interval '1 second'
        WHERE session_id = 'stale'
      `;

      const store = await storage.getAll();
      expect(Object.keys(store.sessions)).toEqual(['live']);
    });
  });

  describe('paginate', () => {
    test('filters by status', async () => {
      await storage.applyEvent({sessionId: 'active-1', queryName: 'q1'});
      await storage.applyEvent({
        sessionId: 'idle-1',
        queryName: 'q2',
        _reason: 'QueryExecutionComplete',
      });

      const result = await storage.paginate({limit: 10}, {status: 'active'});
      expect(result.items.map((s) => s.sessionId)).toEqual(['active-1']);
      // statusCounts is computed from the already status-filtered set (see
      // recalculateSessionStatus/paginate in the in-memory backend) - other
      // statuses read as 0 here, not the totals across all sessions.
      expect(result.statusCounts).toEqual({active: 1, idle: 0, error: 0});
    });

    test('statusCounts reflects all statuses when no status filter is applied', async () => {
      await storage.applyEvent({sessionId: 'active-1', queryName: 'q1'});
      await storage.applyEvent({
        sessionId: 'idle-1',
        queryName: 'q2',
        _reason: 'QueryExecutionComplete',
      });
      await storage.applyEvent({
        sessionId: 'error-1',
        queryName: 'q3',
        _reason: 'QueryExecutionComplete',
        error: 'boom',
      });

      const result = await storage.paginate({limit: 10});
      expect(result.statusCounts).toEqual({active: 1, idle: 1, error: 1});
    });

    test('search matches a query agent/team/tool via session_queries, not just session name', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'q1',
        agent: 'weather-agent',
      });
      await storage.applyEvent({sessionId: 'sess-2', queryName: 'q2'});

      const result = await storage.paginate(
        {limit: 10},
        {search: 'weather-agent'}
      );
      expect(result.items.map((s) => s.sessionId)).toEqual(['sess-1']);
    });

    test('search matches session id/name when no query matches', async () => {
      await storage.applyEvent({
        sessionId: 'session-findme',
        queryName: 'q1',
      });
      await storage.applyEvent({sessionId: 'session-other', queryName: 'q2'});

      const result = await storage.paginate({limit: 10}, {search: 'findme'});
      expect(result.items.map((s) => s.sessionId)).toEqual(['session-findme']);
    });

    test('sorts by conversations count', async () => {
      await storage.applyEvent({
        sessionId: 'many-convs',
        queryName: 'q1',
        conversationId: 'c1',
      });
      await storage.applyEvent({
        sessionId: 'many-convs',
        queryName: 'q2',
        conversationId: 'c2',
      });
      await storage.applyEvent({
        sessionId: 'few-convs',
        queryName: 'q3',
        conversationId: 'c3',
      });

      const result = await storage.paginate({limit: 10}, undefined, {
        field: 'conversations',
        direction: 'desc',
      });
      expect(result.items.map((s) => s.sessionId)).toEqual([
        'many-convs',
        'few-convs',
      ]);
    });

    test('sorts by name and by last activity, in both directions', async () => {
      await storage.applyEvent({sessionId: 'session-charlie', queryName: 'q1'});
      await storage.applyEvent({sessionId: 'session-alpha', queryName: 'q2'});
      await storage.applyEvent({sessionId: 'session-bravo', queryName: 'q3'});

      // Pin last_activity: three writes can land in the same millisecond, and
      // then the date ordering between them is arbitrary.
      await db()`
        UPDATE sessions SET last_activity = CASE session_id
          WHEN 'session-charlie' THEN TIMESTAMPTZ '2024-01-01T00:00:00Z'
          WHEN 'session-alpha'   THEN TIMESTAMPTZ '2024-01-02T00:00:00Z'
          WHEN 'session-bravo'   THEN TIMESTAMPTZ '2024-01-03T00:00:00Z'
        END
      `;

      const byNameAsc = await storage.paginate({limit: 10}, undefined, {
        field: 'name',
        direction: 'asc',
      });
      expect(byNameAsc.items.map((s) => s.name)).toEqual([
        'alpha',
        'bravo',
        'charlie',
      ]);

      const byNameDesc = await storage.paginate({limit: 10}, undefined, {
        field: 'name',
        direction: 'desc',
      });
      expect(byNameDesc.items.map((s) => s.name)).toEqual([
        'charlie',
        'bravo',
        'alpha',
      ]);

      // 'date' is also the fallback when no sort is given: newest first.
      const byDateDesc = await storage.paginate({limit: 10}, undefined, {
        field: 'date',
        direction: 'desc',
      });
      expect(byDateDesc.items.map((s) => s.name)).toEqual([
        'bravo',
        'alpha',
        'charlie',
      ]);

      const byDateAsc = await storage.paginate({limit: 10}, undefined, {
        field: 'date',
        direction: 'asc',
      });
      expect(byDateAsc.items.map((s) => s.name)).toEqual([
        'charlie',
        'alpha',
        'bravo',
      ]);

      const unsorted = await storage.paginate({limit: 10});
      expect(unsorted.items.map((s) => s.name)).toEqual(
        byDateDesc.items.map((s) => s.name)
      );
    });

    test('filters by dateFrom/dateTo against last activity', async () => {
      await storage.applyEvent({sessionId: 'old', queryName: 'q1'});
      await storage.applyEvent({sessionId: 'recent', queryName: 'q2'});

      await db()`
        UPDATE sessions SET last_activity = '2020-01-01T00:00:00Z'
        WHERE session_id = 'old'
      `;

      const from2021 = await storage.paginate(
        {limit: 10},
        {
          dateFrom: '2021-01-01T00:00:00Z',
        }
      );
      expect(from2021.items.map((s) => s.sessionId)).toEqual(['recent']);
      expect(from2021.total).toBe(1);
      expect(from2021.statusCounts.active).toBe(1);

      const until2021 = await storage.paginate(
        {limit: 10},
        {
          dateTo: '2021-01-01T00:00:00Z',
        }
      );
      expect(until2021.items.map((s) => s.sessionId)).toEqual(['old']);

      const windowed = await storage.paginate(
        {limit: 10},
        {
          dateFrom: '2019-01-01T00:00:00Z',
          dateTo: '2021-01-01T00:00:00Z',
        }
      );
      expect(windowed.items.map((s) => s.sessionId)).toEqual(['old']);
    });

    test('paginates with limit/cursor and reports hasMore/nextCursor', async () => {
      for (let i = 0; i < 3; i++) {
        await storage.applyEvent({sessionId: `sess-${i}`, queryName: 'q1'});
      }

      const page1 = await storage.paginate({limit: 2});
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(3);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBe(2);

      const page2 = await storage.paginate({
        limit: 2,
        cursor: page1.nextCursor,
      });
      expect(page2.items).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
      expect(page2.nextCursor).toBeUndefined();
    });
  });

  describe('delete', () => {
    test('clears all sessions', async () => {
      await storage.applyEvent({sessionId: 's1', queryName: 'q1'});
      await storage.applyEvent({sessionId: 's2', queryName: 'q2'});

      await storage.delete();

      expect(await storage.getAll()).toEqual({sessions: {}});
    });

    test('cascade-deletes session_queries rows at the SQL level, not just from the read API', async () => {
      await storage.applyEvent({sessionId: 's1', queryName: 'q1'});

      await storage.delete();

      const rows =
        await db()`SELECT * FROM session_queries WHERE session_id = 's1'`;
      expect(rows).toHaveLength(0);
    });
  });

  describe('subscribe', () => {
    test('emits on applyEvent, delivered via LISTEN/NOTIFY', async () => {
      await storage.whenListening();
      const received: Array<{sessionId: string; queryName: string}> = [];
      storage.subscribe((data) => received.push(data));

      await storage.applyEvent({sessionId: 'sess-1', queryName: 'query-1'});
      await sleep(200);

      expect(received).toEqual([{sessionId: 'sess-1', queryName: 'query-1'}]);
    });

    test('cleanup unsubscribes', async () => {
      await storage.whenListening();
      const received: Array<{sessionId: string; queryName: string}> = [];
      const unsub = storage.subscribe((data) => received.push(data));

      await storage.applyEvent({sessionId: 'sess-1', queryName: 'q1'});
      await sleep(200);
      expect(received).toHaveLength(1);

      unsub();

      await storage.applyEvent({sessionId: 'sess-2', queryName: 'q2'});
      await sleep(200);
      expect(received).toHaveLength(1);
    });

    test('does not emit for a redelivered event that carries nothing new', async () => {
      // The payload is what the controller actually sends, targetType included:
      // treating a repeat of the default 'agent' as a fill would push a
      // spurious update to every watcher on every replica.
      const event = {
        sessionId: 'sess-1',
        queryName: 'query-1',
        agent: 'agent-a',
        targetType: 'agent',
        conversationId: 'conv-1',
      };
      await storage.whenListening();
      await storage.applyEvent(event, 5);
      // Let the first applyEvent's own notification land before subscribing,
      // so it can't be mistaken for one fired by the stale retry below.
      await sleep(200);

      const received: Array<{sessionId: string; queryName: string}> = [];
      storage.subscribe((data) => received.push(data));
      await storage.applyEvent(event, 3);
      await sleep(200);

      expect(received).toHaveLength(0);
    });
  });

  describe('idempotency watermark', () => {
    test('a redelivered event with an equal-or-lower sequence is ignored', async () => {
      await storage.applyEvent(
        {
          sessionId: 'sess-1',
          queryName: 'query-1',
          agent: 'first',
          _reason: 'QueryExecutionComplete',
        },
        5
      );
      await storage.applyEvent(
        {
          sessionId: 'sess-1',
          queryName: 'query-1',
          agent: 'stale-retry',
          _reason: 'QueryExecutionCanceled',
        },
        5
      );

      const query = (await storage.getSession('sess-1'))!.queries['query-1']!;
      // agent is first-write-wins with or without the watermark, so it alone
      // proves nothing; the phase is what the watermark has to protect.
      expect(query.agent).toBe('first');
      expect(query.phase).toBe('done');
    });

    test('a stale terminal event cannot undo a newer one', async () => {
      // The case the metadata/phase split exists for. A later `done` is allowed
      // to clear an earlier `error` (HITL approval), which makes the phase rule
      // non-monotonic - so an older `done` arriving late must not be applied,
      // or it erases a real failure. Asserting a stale `running` instead proves
      // nothing: applyQueryPhase ignores `running` on an existing row anyway.
      await storage.applyEvent(
        {
          sessionId: 'sess-1',
          queryName: 'query-1',
          _reason: 'QueryExecutionComplete',
          error: 'it really failed',
        },
        10
      );
      // It has to carry something new, or the early return drops it before the
      // phase rule is even reached and this would pass either way.
      await storage.applyEvent(
        {
          sessionId: 'sess-1',
          queryName: 'query-1',
          conversationId: 'conv-1',
          agent: 'agent-a',
          _reason: 'QueryExecutionComplete',
        },
        7
      );

      const session = (await storage.getSession('sess-1'))!;
      const query = session.queries['query-1']!;
      expect(query.phase).toBe('error');
      expect(query.error).toBe('it really failed');
      expect(session.errorCount).toBe(1);
      expect(session.status).toBe('error');
      // ...while its metadata was still taken.
      expect(query.agent).toBe('agent-a');
      expect(query.conversationId).toBe('conv-1');
    });

    test('an out-of-order event still contributes fields the query is missing', async () => {
      // The completion event carries no agent or conversationId - only the
      // start event does, and it lost the race. Dropping it outright would
      // leave the query with no conversation, so it would never show up in
      // one, and with no agent name to display.
      await storage.applyEvent(
        {
          sessionId: 'sess-1',
          queryName: 'query-1',
          _reason: 'QueryExecutionComplete',
        },
        10
      );
      await storage.applyEvent(
        {
          sessionId: 'sess-1',
          queryName: 'query-1',
          conversationId: 'conv-1',
          agent: 'agent-a',
          _reason: 'AgentExecutionStart',
        },
        7
      );

      const session = (await storage.getSession('sess-1'))!;
      const query = session.queries['query-1']!;
      expect(query.phase).toBe('done');
      expect(query.agent).toBe('agent-a');
      expect(query.conversationId).toBe('conv-1');
      expect(session.conversations).toHaveLength(1);

      // The watermark must not have regressed to the merged event's sequence,
      // or the phase it was denied would become writable by a replay.
      const [watermark] = await db()<{event: string}[]>`
        SELECT last_applied_event_sequence AS event
        FROM session_queries WHERE query_id = 'query-1'
      `;
      expect(watermark!.event).toBe('10');
    });

    test('a stale event does not re-elect its query as the latest one', async () => {
      // lastActivity decides which query's phase becomes the session status, so
      // an event already known to be out of order must not touch it - otherwise
      // merging its metadata quietly erases a newer failure elsewhere.
      await storage.applyEvent(
        {
          sessionId: 'sess-1',
          queryName: 'healthy',
          _reason: 'QueryExecutionComplete',
        },
        5
      );
      await storage.applyEvent(
        {
          sessionId: 'sess-1',
          queryName: 'failed',
          _reason: 'QueryExecutionComplete',
          error: 'it really failed',
        },
        10
      );
      expect((await storage.getSession('sess-1'))!.status).toBe('error');

      await storage.applyEvent(
        {sessionId: 'sess-1', queryName: 'healthy', queryNamespace: 'ns-x'},
        1
      );

      const session = (await storage.getSession('sess-1'))!;
      expect(session.queries['healthy']!.namespace).toBe('ns-x');
      expect(session.status).toBe('error');
      expect(session.errorCount).toBe(1);
    });

    test('an out-of-order event contributes a namespace the query is missing', async () => {
      // namespace has no merge rule of its own in the phase half, so if it is
      // not merged here a stale event carrying only a namespace looks like it
      // changed nothing and gets dropped whole.
      await storage.applyEvent(
        {
          sessionId: 'sess-1',
          queryName: 'query-1',
          _reason: 'QueryExecutionComplete',
        },
        10
      );
      await storage.applyEvent(
        {
          sessionId: 'sess-1',
          queryName: 'query-1',
          queryNamespace: 'team-a',
          _reason: 'AgentExecutionStart',
        },
        7
      );

      const query = (await storage.getSession('sess-1'))!.queries['query-1']!;
      expect(query.namespace).toBe('team-a');
      expect(query.phase).toBe('done');
    });

    test('an undefined sequence never poisons the watermark to NULL: a later real sequence still applies', async () => {
      await storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        agent: 'from-undefined-sequence',
      });
      await storage.applyEvent(
        {
          sessionId: 'sess-1',
          queryName: 'query-1',
          _reason: 'QueryExecutionComplete',
        },
        1
      );

      const query = (await storage.getSession('sess-1'))!.queries['query-1']!;
      expect(query.phase).toBe('done');
      expect(query.agent).toBe('from-undefined-sequence');
    });

    test('event and message watermarks are tracked independently', async () => {
      // The two streams number their own rows, so a message sequence below the
      // last event sequence is not a replay and must still apply. One shared
      // watermark column would reject it, and the two columns below would
      // hold the same value.
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'query-1'}, 10);
      await storage.applyMessage('conv-1', 'query-1', 3);

      const query = (await storage.getSession('sess-1'))!.queries['query-1']!;
      expect(query.conversationId).toBe('conv-1');

      const [watermarks] = await db()<
        {event: string; message: string}[]
      >`SELECT last_applied_event_sequence AS event,
               last_applied_message_sequence AS message
        FROM session_queries WHERE query_id = 'query-1'`;
      expect(watermarks).toEqual({event: '10', message: '3'});
    });
  });

  describe('concurrency', () => {
    const LOCK_WAIT_TIMEOUT_MS = 10_000;
    const GATE_MAX_HOLD_MS = 15_000;

    /**
     * Holds the session header's row lock until released. `locked` resolves once
     * the lock is genuinely held, so writers can be queued behind it without a
     * sleep standing in for that guarantee - the point of these tests is that
     * the writers contend, and a sleep that expires early leaves them racing
     * the gate instead, which passes without exercising anything.
     */
    function holdSessionHeader(
      sessionId: string,
      onRelease?: (sql: postgres.TransactionSql) => Promise<unknown>
    ): {locked: Promise<void>; release: () => void; done: Promise<unknown>} {
      let signalLocked!: () => void;
      const locked = new Promise<void>((resolve) => {
        signalLocked = resolve;
      });
      let release!: () => void;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });

      const done = db().begin(async (sql) => {
        await sql`SELECT session_id FROM sessions WHERE session_id = ${sessionId} FOR UPDATE`;
        signalLocked();
        // A test that fails before releasing would otherwise leave this
        // transaction holding a pooled connection for the rest of the file, and
        // the next test to need one blocks instead of reporting the failure.
        await Promise.race([released, sleep(GATE_MAX_HOLD_MS)]);
        if (onRelease) await onRelease(sql);
      });
      // Keeps an unreleased gate from surfacing as an unhandled rejection; the
      // promise handed back still rejects for whoever awaits it.
      void done.catch(() => {});

      return {locked, release, done};
    }

    /**
     * Waits until `count` backends are parked on a lock, so the queue order
     * behind the gate is known rather than assumed. Throws instead of returning
     * quietly when the contention never appears, which is what stops these
     * tests passing with the race window never reached.
     */
    async function waitForLockWaiters(count: number): Promise<void> {
      const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
      for (;;) {
        const [row] = await db()<{waiting: string}[]>`
          SELECT count(*) AS waiting FROM pg_stat_activity
          WHERE datname = current_database()
            AND wait_event_type = 'Lock'
            AND pid <> pg_backend_pid()
        `;
        if (Number(row!.waiting) >= count) return;
        if (Date.now() > deadline) {
          throw new Error(
            `expected ${count} backend(s) waiting on a lock, saw ${row!.waiting}`
          );
        }
        await sleep(10);
      }
    }

    test('concurrent events for two different queries in the same session both land without lost updates', async () => {
      await Promise.all(
        Array.from({length: 10}, (_, i) =>
          storage.applyEvent({sessionId: 'shared', queryName: `q-even-${i}`})
        )
      );
      await Promise.all(
        Array.from({length: 10}, (_, i) =>
          storage.applyEvent({sessionId: 'shared', queryName: `q-odd-${i}`})
        )
      );

      const session = (await storage.getSession('shared'))!;
      expect(Object.keys(session.queries)).toHaveLength(20);
    });

    test('concurrent error events across many queries in one session produce an exact errorCount (no lost header updates)', async () => {
      const N = 15;
      await Promise.all(
        Array.from({length: N}, (_, i) =>
          storage.applyEvent({
            sessionId: 'shared-errors',
            queryName: `q-${i}`,
            _reason: 'QueryExecutionComplete',
            error: `boom-${i}`,
          })
        )
      );

      const session = (await storage.getSession('shared-errors'))!;
      expect(session.errorCount).toBe(N);
      expect(Object.keys(session.queries)).toHaveLength(N);
    });

    test('concurrent events for the same query on a cold session are serialized by the sessions primary key, not by the header lock', async () => {
      // The session does not exist yet, so both transactions collide on the
      // same speculative `sessions` row and Postgres serializes them there.
      // This passes with the FOR UPDATE removed from lockHeader - it is the
      // test below that exercises the lock.
      await Promise.all([
        storage.applyEvent({
          sessionId: 'sess-1',
          queryName: 'query-1',
          agent: 'agent-a',
        }),
        storage.applyEvent({
          sessionId: 'sess-1',
          queryName: 'query-1',
          _reason: 'QueryExecutionComplete',
        }),
      ]);

      const query = (await storage.getSession('sess-1'))!.queries['query-1']!;
      expect(query.agent).toBe('agent-a');
      expect(query.phase).toBe('done');
    });

    test('concurrent events for the same query serialize instead of losing an update once the session header is committed', async () => {
      // Once the header is committed, INSERT ... ON CONFLICT DO NOTHING takes
      // no lock, and a SELECT ... FOR UPDATE on a query row that does not exist
      // yet locks nothing either - so both transactions can read "no such
      // query" before either has written one.
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'seed'});

      // Hold the header so both writers are parked behind it, guaranteeing they
      // both got past that read. Without it the race is real but rarely lands.
      const gate = holdSessionHeader('sess-1');
      await gate.locked;

      // Queued in a known order: the writer carrying the metadata reaches the
      // lock first, and the one behind it must not erase what it wrote.
      const first = storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        conversationId: 'conv-1',
        agent: 'agent-a',
      });
      await waitForLockWaiters(1);
      const second = storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        _reason: 'QueryExecutionComplete',
      });
      const writers = Promise.all([first, second]);
      await waitForLockWaiters(2);
      gate.release();
      await gate.done;
      await writers;

      const session = (await storage.getSession('sess-1'))!;
      const query = session.queries['query-1']!;
      expect(query.agent).toBe('agent-a');
      expect(query.conversationId).toBe('conv-1');
      expect(session.conversations).toHaveLength(1);
    });

    test('events and messages interleaved on one session never deadlock', async () => {
      // Both write paths must lock the session header before they read
      // session_queries. If either one is reordered back to read-then-lock,
      // the two take their locks in opposite orders and Postgres kills one
      // of them with 40P01.
      const N = 8;
      await Promise.all(
        Array.from({length: N}, (_, i) =>
          storage.applyEvent({
            sessionId: 'mixed',
            queryName: `q-${i}`,
            conversationId: `conv-${i}`,
            agent: 'agent-a',
          })
        )
      );

      await Promise.all(
        Array.from({length: N}, (_, i) => [
          storage.applyEvent({
            sessionId: 'mixed',
            queryName: `q-${i}`,
            _reason: 'QueryExecutionComplete',
          }),
          storage.applyMessage(`conv-${i}`, `q-${i}`),
        ]).flat()
      );

      const session = (await storage.getSession('mixed'))!;
      expect(Object.keys(session.queries)).toHaveLength(N);
      expect(session.conversations).toHaveLength(N);
      expect(session.status).toBe('idle');
    });

    test('a purge committing while a write waits for the header does not fail the write', async () => {
      // The header insert takes no lock when the row already exists, so a purge
      // can commit between it and the header lock. The write then holds a lock
      // on nothing, and its query insert would trip the foreign key. Held here
      // deterministically: the gate owns the header, the write parks behind it,
      // and the gate deletes the row before releasing.
      await storage.applyEvent({sessionId: 'sess-1', queryName: 'seed'});

      const gate = holdSessionHeader(
        'sess-1',
        (sql) => sql`DELETE FROM sessions WHERE session_id = 'sess-1'`
      );
      await gate.locked;

      const write = storage.applyEvent({
        sessionId: 'sess-1',
        queryName: 'query-1',
        conversationId: 'conv-1',
        agent: 'agent-a',
      });
      await waitForLockWaiters(1);
      gate.release();
      await gate.done;

      await expect(write).resolves.toBeUndefined();

      // The purge won, so the event recreates the session rather than failing.
      const session = (await storage.getSession('sess-1'))!;
      expect(Object.keys(session.queries)).toEqual(['query-1']);
      expect(session.queries['query-1']!.agent).toBe('agent-a');
    });

    test('many concurrent conversation-joining queries in one session all count in messageCount', async () => {
      const N = 12;
      await Promise.all(
        Array.from({length: N}, (_, i) =>
          storage.applyEvent({
            sessionId: 'shared-conv',
            queryName: `q-${i}`,
            conversationId: 'conv-shared',
            agent: 'agent-a',
          })
        )
      );

      const session = (await storage.getSession('shared-conv'))!;
      expect(session.conversations).toHaveLength(1);
      expect(session.conversations![0]!.messageCount).toBe(N);
    });
  });

  describe('header aggregates', () => {
    const events = [
      {sessionId: 's', queryName: 'q1', conversationId: 'c1', agent: 'agent-a'},
      {sessionId: 's', queryName: 'q2', conversationId: 'c1', agent: 'agent-b'},
      {
        sessionId: 's',
        queryName: 'q2',
        conversationId: 'c1',
        agent: 'agent-b',
        _reason: 'QueryExecutionComplete',
        error: 'boom',
      },
      {sessionId: 's', queryName: 'q3', conversationId: 'c2', team: 'team-c'},
    ];

    test('a message does not re-elect the status, on either backend', async () => {
      // A message bumps the query's lastActivity, so recomputing the status
      // election here would let a message on a healthy query erase a newer
      // failure - and push that wrong value to every watcher.
      const inMemory = new InMemorySessionsStorage(silentLogger);
      const healthy = {
        sessionId: 's',
        queryName: 'healthy',
        _reason: 'QueryExecutionComplete',
      };
      const failed = {
        sessionId: 's',
        queryName: 'failed',
        _reason: 'QueryExecutionComplete',
        error: 'it really failed',
      };
      for (const backend of [storage, inMemory]) {
        await backend.applyEvent(healthy);
        // The status election ties on equal lastActivity and keeps the first
        // query, and the in-memory backend applies both within one millisecond.
        await sleep(2);
        await backend.applyEvent(failed);
        expect((await backend.getSession('s'))!.status).toBe('error');
        await sleep(2);
        await backend.applyMessage('c1', 'healthy');
      }

      const fromPg = (await storage.getSession('s'))!;
      const fromMemory = (await inMemory.getSession('s'))!;
      expect(fromPg.status).toBe('error');
      expect(fromMemory.status).toBe('error');
      expect(fromPg.errorCount).toBe(1);
      expect(fromMemory.errorCount).toBe(1);
      // ...while the conversation the message revealed is still picked up.
      expect(fromPg.conversations).toHaveLength(1);
      expect(fromMemory.conversations).toHaveLength(1);
    });

    test('a message does not re-elect the status on a later header refresh', async () => {
      // Skipping the election in the message's own transaction is not enough:
      // any later write refreshes the header and runs the election again, so a
      // message must leave nothing behind that could win it.
      await storage.applyEvent(
        {
          sessionId: 's',
          queryName: 'healthy',
          conversationId: 'c1',
          _reason: 'QueryExecutionComplete',
        },
        1
      );
      await sleep(2);
      await storage.applyEvent(
        {
          sessionId: 's',
          queryName: 'failed',
          conversationId: 'c1',
          _reason: 'QueryExecutionComplete',
          error: 'it really failed',
        },
        2
      );
      expect((await storage.getSession('s'))!.status).toBe('error');

      await sleep(2);
      await storage.applyMessage('c1', 'healthy');

      // A second replica applying an out-of-order event for the failed query:
      // its phase is denied, but its metadata merges, and that write refreshes
      // the header.
      await sleep(2);
      await storage.applyEvent(
        {
          sessionId: 's',
          queryName: 'failed',
          agent: 'agent-late',
          _reason: 'QueryExecutionComplete',
          error: 'it really failed',
        },
        1
      );

      const session = (await storage.getSession('s'))!;
      expect(session.queries['failed']!.agent).toBe('agent-late');
      expect(session.status).toBe('error');
      expect(session.errorCount).toBe(1);
    });

    test('a message moves the header and the TTL forward, not the query row', async () => {
      type Timestamps = {header: Date; query: Date; expires: Date};
      const readTimestamps = async (): Promise<Timestamps[]> =>
        db()<Timestamps[]>`
          SELECT s.last_activity AS header, s.expires_at AS expires,
                 sq.last_activity AS query
          FROM sessions s
          JOIN session_queries sq ON sq.session_id = s.session_id
          WHERE s.session_id = 's'
        `;

      await storage.applyEvent({
        sessionId: 's',
        queryName: 'q1',
        _reason: 'QueryExecutionComplete',
      });
      const [before] = await readTimestamps();

      await sleep(5);
      await storage.applyMessage('c1', 'q1');

      const [after] = await readTimestamps();
      // A message is activity for the session - it keeps the session at the top
      // of a date-sorted list and holds the TTL open - but it is not activity
      // for the query, whose lastActivity elects the session status.
      expect(after!.query.getTime()).toBe(before!.query.getTime());
      expect(after!.header.getTime()).toBeGreaterThan(before!.header.getTime());
      expect(after!.expires.getTime()).toBeGreaterThan(
        before!.expires.getTime()
      );
    });

    test('aggregates match the in-memory backend when a message joins the conversation', async () => {
      // Some queries only learn their conversation from a message, and a query
      // that is already terminal gets no further event - so whichever backend
      // skips the recompute here never shows that conversation at all.
      const inMemory = new InMemorySessionsStorage(silentLogger);
      const event = {
        sessionId: 's',
        queryName: 'q1',
        agent: 'agent-a',
        _reason: 'QueryExecutionComplete',
      };
      await storage.applyEvent(event);
      await inMemory.applyEvent(event);
      await storage.applyMessage('c1', 'q1');
      await inMemory.applyMessage('c1', 'q1');

      const fromPg = (await storage.getSession('s'))!;
      const fromMemory = (await inMemory.getSession('s'))!;

      expect(fromPg.queries['q1']!.conversationId).toBe('c1');
      expect(fromPg.conversations).toHaveLength(1);
      expect(fromPg.participants).toEqual([
        {id: 'agent-a', name: 'agent-a', type: 'agent'},
      ]);
      expect(fromMemory.participants).toEqual(fromPg.participants);
      expect(fromMemory.conversations!.map((c) => c.conversationId)).toEqual(
        fromPg.conversations!.map((c) => c.conversationId)
      );
    });

    test('aggregates match the in-memory backend event for event', async () => {
      const inMemory = new InMemorySessionsStorage(silentLogger);
      for (const event of events) {
        await storage.applyEvent(event);
        await inMemory.applyEvent(event);
      }

      const fromPg = (await storage.getSession('s'))!;
      const fromMemory = (await inMemory.getSession('s'))!;

      expect(fromPg.status).toEqual(fromMemory.status);
      expect(fromPg.errorCount).toEqual(fromMemory.errorCount);
      expect(fromPg.participants).toEqual(fromMemory.participants);
      // Wall-clock fields differ by the milliseconds between the two writes.
      const withoutTimestamps = (
        list: ConversationSummary[]
      ): Record<string, unknown>[] =>
        list.map((c) => ({...c, duration: null, startTime: null}));
      expect(withoutTimestamps(fromPg.conversations!)).toEqual(
        withoutTimestamps(fromMemory.conversations!)
      );
    });

    test('conversation startTime comes from the earliest query, whatever order rows come back in', async () => {
      await storage.applyEvent({
        sessionId: 's',
        queryName: 'zzz-first',
        conversationId: 'c1',
        agent: 'agent-a',
      });
      await storage.applyEvent({
        sessionId: 's',
        queryName: 'aaa-second',
        conversationId: 'c1',
        agent: 'agent-a',
      });

      // Names sort the opposite way to creation, so a missing ORDER BY
      // created_at in refreshHeader would pick the wrong query here.
      const [earliest] = await db()<{created_at: Date}[]>`
        SELECT created_at FROM session_queries
        WHERE session_id = 's' ORDER BY created_at LIMIT 1
      `;

      const conv = (await storage.getSession('s'))!.conversations![0]!;
      expect(conv.startTime).toBe(earliest!.created_at.toISOString());
    });

    test('a second agent joining a conversation shows up in the conversation, not at session level', async () => {
      // Pins the shape the sessions-broker-postgres-xreplica e2e asserts.
      // Session participants are one per conversation, named after that
      // conversation's first agent, so a second agent on the same conversation
      // is only visible inside it. Matches the in-memory backend.
      const shared = {
        sessionId: 's',
        conversationId: 'c1',
        targetType: 'agent',
      };
      await storage.applyEvent({...shared, queryName: 'q1', agent: 'agent-a'});
      await storage.applyEvent({...shared, queryName: 'q2', agent: 'agent-b'});
      await storage.applyEvent({
        sessionId: 's',
        queryName: 'q3',
        conversationId: 'c2',
        tool: 'tool-c',
        targetType: 'tool',
        _reason: 'QueryExecutionComplete',
        error: 'boom',
      });

      const session = (await storage.getSession('s'))!;
      expect(Object.keys(session.queries)).toHaveLength(3);
      expect(session.errorCount).toBe(1);
      expect(session.participants!.map((p) => p.name).sort()).toEqual([
        'agent-a',
        'tool-c',
      ]);
      expect(
        session
          .conversations!.map((c) => c.participants.slice().sort().join('+'))
          .sort()
      ).toEqual(['agent-a+agent-b', 'tool-c']);
    });

    test('a header corrupted out from under the storage repairs on the next write', async () => {
      for (const event of events) {
        await storage.applyEvent(event);
      }
      const healthy = (await storage.getSession('s'))!;

      await db()`
        UPDATE sessions SET
          status = 'active',
          error_count = 99,
          conversations = '[]'::jsonb
        WHERE session_id = 's'
      `;
      const corrupted = (await storage.getSession('s'))!;
      expect(corrupted.errorCount).toBe(99);
      expect(corrupted.participants).toEqual([]);

      await storage.applyEvent({
        sessionId: 's',
        queryName: 'q3',
        conversationId: 'c2',
        team: 'team-c',
        _reason: 'QueryExecutionComplete',
      });

      const repaired = (await storage.getSession('s'))!;
      expect(repaired.status).toBe(healthy.status);
      expect(repaired.errorCount).toBe(healthy.errorCount);
      expect(repaired.participants).toEqual(healthy.participants);
      expect(repaired.conversations).toHaveLength(
        healthy.conversations!.length
      );
    });
  });
  describe('schema constraints', () => {
    const seedSession = async (): Promise<void> => {
      await db()`
        INSERT INTO sessions (session_id, name, expires_at)
        VALUES ('sess-1', 'sess-1', now() + interval '1 hour')
        ON CONFLICT DO NOTHING
      `;
    };
    const insertQuery = async (
      column: 'target_type' | 'phase',
      value: string
    ): Promise<void> => {
      await db()`
        INSERT INTO session_queries (session_id, query_id, target_type, phase)
        VALUES (
          'sess-1',
          ${`q-${column}-${value}`},
          ${column === 'target_type' ? value : 'running'},
          ${column === 'phase' ? value : 'running'}
        )
      `;
    };

    test("accepts every target_type the Query CRD allows, 'model' included", async () => {
      // The aggregate only branches on agent/team/tool, so it is tempting to
      // constrain to those three - but the CRD's own enum is
      // agent;team;model;tool, and a model-targeted query would then fail every
      // event ingest with a constraint violation.
      await seedSession();
      for (const targetType of ['agent', 'team', 'model', 'tool']) {
        await expect(
          insertQuery('target_type', targetType)
        ).resolves.toBeUndefined();
      }
    });

    test('rejects a target_type outside that enum', async () => {
      await seedSession();
      await expect(insertQuery('target_type', 'spaceship')).rejects.toThrow(
        /session_queries_target_type_check/
      );
    });

    test('rejects a phase outside the QueryPhase union', async () => {
      await seedSession();
      await expect(insertQuery('phase', 'almost-done')).rejects.toThrow(
        /session_queries_phase_check/
      );
    });

    test('rejects a session status outside the elected three', async () => {
      await seedSession();
      await expect(
        db()`UPDATE sessions SET status = 'grumpy' WHERE session_id = 'sess-1'`
      ).rejects.toThrow(/sessions_status_check/);
    });
  });
});
