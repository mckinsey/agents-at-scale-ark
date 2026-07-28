import {existsSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {EventEmitter} from 'node:events';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {PaginationParams} from '../pagination.js';
import type {
  PaginatedSessionsList,
  QueryEntry,
  SessionEntry,
  SessionEventData,
  SessionsFilter,
  SessionsSort,
  SessionsStorage,
  SessionsStore,
} from '../sessions-broker.js';
import {
  buildQueryEntry,
  normalizeEventData,
  recalculateSessionStatus,
  resolveQueryPhase,
  updateExistingQuery,
} from './session-aggregate.js';

export class InMemorySessionsStorage implements SessionsStorage {
  private store: SessionsStore = {sessions: {}};
  private queryToSession: Map<string, string> = new Map();
  private readonly emitter = new EventEmitter();
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly path?: string
  ) {
    if (path) {
      this.logger.info({path}, 'persistence enabled');
      this.loadFromDisk();
    }
  }

  private loadFromDisk(): void {
    if (!this.path) return;
    try {
      if (existsSync(this.path)) {
        const data = JSON.parse(readFileSync(this.path, 'utf-8'));
        if (data?.sessions) {
          this.store = data;
          this.rebuildIndex();

          const sessionCount = Object.keys(this.store.sessions).length;
          const queryCount = this.queryToSession.size;
          this.logger.info(
            {sessions: sessionCount, queries: queryCount},
            'loaded'
          );
        }
      } else {
        this.logger.info('no existing data');
      }
    } catch (err) {
      this.logger.error({err}, 'failed to load');
    }
  }

  private rebuildIndex(): void {
    this.queryToSession.clear();

    for (const [sessionId, session] of Object.entries(this.store.sessions)) {
      recalculateSessionStatus(session);

      for (const queryId of Object.keys(session.queries)) {
        this.queryToSession.set(queryId, sessionId);
      }
    }
  }

  private deferredSave(): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) {
        void this.save();
        this.dirty = false;
      }
    }, 2000);
  }

  async applyEvent(eventData: Partial<SessionEventData>): Promise<void> {
    const {sessionId, queryName} = eventData;
    if (!sessionId || !queryName) {
      this.logger.warn(
        {sessionId, queryName},
        'dropping event: missing sessionId or queryName'
      );
      return;
    }

    const now = new Date().toISOString();
    const reason = eventData._reason || '';
    const errorMsg = eventData.error;
    const normalizedEventData = normalizeEventData(eventData);

    if (!this.store.sessions[sessionId]) {
      this.store.sessions[sessionId] = {
        sessionId,
        name: sessionId.startsWith('session-')
          ? sessionId.substring(8)
          : sessionId,
        queries: {},
        status: 'idle',
        errorCount: 0,
        createdAt: now,
        lastActivity: now,
      };
    }

    const session = this.store.sessions[sessionId];
    session.lastActivity = now;

    const queryPhase = resolveQueryPhase(reason, errorMsg);

    const existing = session.queries[queryName];
    if (existing) {
      updateExistingQuery(existing, queryPhase, normalizedEventData, errorMsg);
    } else {
      session.queries[queryName] = buildQueryEntry(
        queryName,
        now,
        queryPhase,
        normalizedEventData,
        errorMsg
      );
      this.queryToSession.set(queryName, sessionId);
    }

    recalculateSessionStatus(session);

    this.deferredSave();
    this.emitter.emit('upsert', {sessionId, queryName});
  }

  async applyMessage(conversationId: string, queryId: string): Promise<void> {
    const sessionId = this.queryToSession.get(queryId);
    if (!sessionId) return;

    const session = this.store.sessions[sessionId];
    if (!session) return;

    const query = session.queries[queryId];
    if (!query) return;

    query.lastActivity = new Date().toISOString();
    const joinedConversation = !query.conversationId;
    if (joinedConversation) {
      query.conversationId = conversationId;
    }
    session.lastActivity = query.lastActivity;
    // A message is what first attaches some queries to a conversation, and a
    // query that is already terminal gets no further event to fold it in - so
    // without this the conversation would never appear at all. The aggregate
    // really changed, so watchers are told, as they are for an event.
    if (joinedConversation) {
      recalculateSessionStatus(session);
      this.emitter.emit('upsert', {sessionId, queryName: queryId});
    }
    this.deferredSave();
  }

  async getAll(): Promise<SessionsStore> {
    return this.store;
  }

  async getSession(sessionId: string): Promise<SessionEntry | undefined> {
    return this.store.sessions[sessionId];
  }

  /**
   * Paginate sessions with filtering and sorting.
   *
   * NOTE: Uses offset-based pagination (not true cursor pagination).
   * The cursor is just an array index, which means:
   * - Results may include duplicates or skip items if sessions are added/deleted between pages
   * - Changing sort order or filters invalidates previous cursors
   * - Not suitable for reliable iteration over the full dataset
   */
  async paginate(
    params: PaginationParams,
    filters?: SessionsFilter,
    sort?: SessionsSort
  ): Promise<PaginatedSessionsList> {
    let sessions = Object.values(this.store.sessions);

    if (filters?.status) {
      sessions = sessions.filter((s) => {
        const sessionStatus = s.status ?? 'idle';
        return sessionStatus === filters.status;
      });
    }

    if (filters?.dateFrom) {
      const from = new Date(filters.dateFrom).getTime();
      sessions = sessions.filter(
        (s) => new Date(s.lastActivity).getTime() >= from
      );
    }

    if (filters?.dateTo) {
      const to = new Date(filters.dateTo).getTime();
      sessions = sessions.filter(
        (s) => new Date(s.lastActivity).getTime() <= to
      );
    }

    if (filters?.search) {
      const search = filters.search.toLowerCase();
      sessions = sessions.filter(
        (s) =>
          s.sessionId.toLowerCase().includes(search) ||
          s.name.toLowerCase().includes(search) ||
          Object.values(s.queries).some(
            (q) =>
              (q.agent?.toLowerCase() || '').includes(search) ||
              (q.team?.toLowerCase() || '').includes(search) ||
              (q.tool?.toLowerCase() || '').includes(search)
          )
      );
    }

    if (sort) {
      sessions.sort((a, b) => {
        let comparison = 0;
        if (sort.field === 'date') {
          comparison =
            new Date(a.lastActivity).getTime() -
            new Date(b.lastActivity).getTime();
        } else if (sort.field === 'name') {
          comparison = a.name.localeCompare(b.name);
        } else if (sort.field === 'conversations') {
          const firstSessionConversationCount = new Set(
            Object.values(a.queries)
              .map((q) => q.conversationId)
              .filter(Boolean)
          ).size;
          const secondSessionConversationCount = new Set(
            Object.values(b.queries)
              .map((q) => q.conversationId)
              .filter(Boolean)
          ).size;
          comparison =
            firstSessionConversationCount - secondSessionConversationCount;
        }
        return sort.direction === 'asc' ? comparison : -comparison;
      });
    }

    const total = sessions.length;

    // Calculate status counts from the filtered result set
    const statusCounts = {
      active: sessions.filter((s) => s.status === 'active').length,
      idle: sessions.filter((s) => (s.status ?? 'idle') === 'idle').length,
      error: sessions.filter((s) => s.status === 'error').length,
    };

    const startIndex = params.cursor || 0;
    const endIndex = startIndex + params.limit;
    const items = sessions.slice(startIndex, endIndex);
    const hasMore = endIndex < total;
    // nextCursor is the array offset for the next page (not a stable cursor)
    const nextCursor = hasMore ? endIndex : undefined;

    return {
      items,
      total,
      hasMore,
      nextCursor,
      statusCounts,
    };
  }

  async getQueryByConversationId(
    conversationId: string
  ): Promise<(QueryEntry & {sessionId: string}) | undefined> {
    for (const [sessionId, session] of Object.entries(this.store.sessions)) {
      for (const query of Object.values(session.queries)) {
        if (query.conversationId === conversationId) {
          return {...query, sessionId};
        }
      }
    }
    return undefined;
  }

  async save(): Promise<void> {
    if (!this.path) return;
    try {
      const dir = dirname(this.path);
      if (!existsSync(dir)) mkdirSync(dir, {recursive: true});
      writeFileSync(this.path, JSON.stringify(this.store, null, 2));
    } catch (err) {
      this.logger.error({err}, 'failed to save');
    }
  }

  async delete(): Promise<void> {
    this.store = {sessions: {}};
    return this.save();
  }

  subscribe(
    callback: (data: {sessionId: string; queryName: string}) => void
  ): () => void {
    this.emitter.on('upsert', callback);
    return () => this.emitter.off('upsert', callback);
  }
}
