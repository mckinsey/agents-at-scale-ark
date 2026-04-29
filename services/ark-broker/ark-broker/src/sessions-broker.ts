import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import type { QueryPhase, SessionEventData } from './types.js';
import { QueryPhases, EventReasons, ERROR_REASON_SUFFIX } from './types.js';
import type { PaginationParams, PaginatedList } from './pagination.js';

export interface QueryEntry {
  /** Query resource name from the Ark CRD */
  name: string;
  /** Kubernetes namespace the query belongs to */
  namespace?: string;
  /** Conversation ID assigned by the memory broker */
  conversationId?: string;
  /** Name of the agent handling this query */
  agent?: string;
  /** Name of the team handling this query */
  team?: string;
  /** Name of the tool handling this query */
  tool?: string;
  /** CRD target type (agent, team, model, tool) */
  targetType: string;
  /** Current lifecycle phase derived from incoming events */
  phase: QueryPhase;
  /** Error message if phase is 'error' */
  error?: string;
  /** ISO timestamp when the query was first seen */
  createdAt: string;
  /** ISO timestamp when the query reached a terminal phase */
  completedAt?: string;
  /** ISO timestamp of the most recent event for this query */
  lastActivity: string;
}

/** A single session containing one or more queries grouped by session ID */
export interface SessionEntry {
  sessionId: string;
  name: string;
  queries: Record<string, QueryEntry>;
  createdAt: string;
  lastActivity: string;
}

export interface SessionsStore {
  sessions: Record<string, SessionEntry>;
}

/**
 * Live event-sourced materialized index of sessions and queries. Enriched as
 * events and messages flow through the broker. Consumers can subscribe via SSE
 * to watch sessions mutate in real-time, or poll/GET for post-hoc analysis.
 */
export class SessionsBroker {
  private store: SessionsStore = { sessions: {} };
  private readonly emitter = new EventEmitter();
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly path?: string) {
    if (path) {
      console.log(`[Sessions] persistence enabled at ${path}`);
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
          const sessionCount = Object.keys(this.store.sessions).length;
          const queryCount = Object.values(this.store.sessions)
            .reduce((sum, s) => sum + Object.keys(s.queries).length, 0);
          console.log(`[Sessions] loaded ${sessionCount} sessions, ${queryCount} queries`);
        }
      } else {
        console.log(`[Sessions] no existing data`);
      }
    } catch (e) {
      console.error(`[Sessions] failed to load:`, e);
    }
  }

  private deferredSave(): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) {
        this.save();
        this.dirty = false;
      }
    }, 2000);
  }

  private resolveQueryPhase(reason: string, errorMsg?: string): QueryPhase {
    if (reason === EventReasons.QueryExecutionComplete) {
      return errorMsg ? QueryPhases.Error : QueryPhases.Done;
    }
    if (reason.includes(ERROR_REASON_SUFFIX)) {
      return QueryPhases.Error;
    }
    return QueryPhases.Running;
  }

  private updateExistingQuery(
    existing: QueryEntry,
    phase: QueryPhase,
    eventData: Partial<SessionEventData>,
    errorMsg?: string
  ): void {
    const now = new Date().toISOString();
    existing.lastActivity = now;

    if (eventData.conversationId && !existing.conversationId) {
      existing.conversationId = eventData.conversationId;
    }
    if (eventData.agent && !existing.agent) {
      existing.agent = eventData.agent;
    }
    if (eventData.team && !existing.team) {
      existing.team = eventData.team;
    }
    if (eventData.tool && !existing.tool) {
      existing.tool = eventData.tool;
    }
    if (eventData.targetType && existing.targetType === 'agent') {
      existing.targetType = eventData.targetType;
    }

    if (phase === QueryPhases.Error) {
      existing.phase = QueryPhases.Error;
      existing.error = errorMsg;
      existing.completedAt = now;
    } else if (phase === QueryPhases.Done && existing.phase !== QueryPhases.Error) {
      existing.phase = QueryPhases.Done;
      existing.completedAt = now;
    }
  }

  applyEvent(eventData: Partial<SessionEventData>): void {
    const { sessionId, queryName } = eventData;
    if (!sessionId || !queryName) return;

    const now = new Date().toISOString();
    const { queryNamespace } = eventData;
    const reason = eventData._reason || '';
    const errorMsg = eventData.error;

    // Map toolName to tool for backward compatibility with completions executor
    const normalizedEventData = {
      ...eventData,
      tool: eventData.tool || (eventData as any).toolName,
    };

    if (!this.store.sessions[sessionId]) {
      this.store.sessions[sessionId] = {
        sessionId,
        name: sessionId.startsWith('session-') ? sessionId.substring(8) : sessionId,
        queries: {},
        createdAt: now,
        lastActivity: now,
      };
    }

    const session = this.store.sessions[sessionId];
    session.lastActivity = now;

    const queryPhase = this.resolveQueryPhase(reason, errorMsg);

    const existing = session.queries[queryName];
    if (existing) {
      this.updateExistingQuery(existing, queryPhase, normalizedEventData, errorMsg);
    } else {
      session.queries[queryName] = {
        name: queryName,
        namespace: queryNamespace,
        conversationId: normalizedEventData.conversationId || undefined,
        agent: normalizedEventData.agent,
        team: normalizedEventData.team,
        tool: normalizedEventData.tool,
        targetType: normalizedEventData.targetType || 'agent',
        phase: queryPhase,
        error: errorMsg,
        createdAt: now,
        completedAt: queryPhase === QueryPhases.Running ? undefined : now,
        lastActivity: now,
      };
    }

    this.deferredSave();
    this.emitter.emit('upsert', { sessionId, queryName });
  }

  applyMessage(conversationId: string, queryId: string): void {
    for (const session of Object.values(this.store.sessions)) {
      const query = session.queries[queryId];
      if (query) {
        query.lastActivity = new Date().toISOString();
        if (!query.conversationId) {
          query.conversationId = conversationId;
        }
        session.lastActivity = query.lastActivity;
        this.deferredSave();
        return;
      }
    }
  }

  getAll(): SessionsStore {
    return this.store;
  }

  getSession(sessionId: string): SessionEntry | undefined {
    return this.store.sessions[sessionId];
  }

  paginate(params: PaginationParams, filters?: {
    status?: 'active' | 'idle' | 'error';
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }, sort?: {
    field: 'date' | 'name' | 'conversations';
    direction: 'asc' | 'desc';
  }): PaginatedList<SessionEntry> {
    let sessions = Object.values(this.store.sessions);

    if (filters?.status) {
      sessions = sessions.filter(s => {
        const queries = Object.values(s.queries);
        const errors = queries.filter(q => q.phase === 'error');
        const active = queries.some(q => q.phase === 'running' || q.phase === 'pending');

        if (filters.status === 'error') return errors.length > 0;
        if (filters.status === 'active') return active;
        if (filters.status === 'idle') return !active && errors.length === 0;
        return true;
      });
    }

    if (filters?.dateFrom) {
      const from = new Date(filters.dateFrom).getTime();
      sessions = sessions.filter(s => new Date(s.lastActivity).getTime() >= from);
    }

    if (filters?.dateTo) {
      const to = new Date(filters.dateTo).getTime();
      sessions = sessions.filter(s => new Date(s.lastActivity).getTime() <= to);
    }

    if (filters?.search) {
      const search = filters.search.toLowerCase();
      sessions = sessions.filter(s =>
        s.sessionId.toLowerCase().includes(search) ||
        s.name.toLowerCase().includes(search) ||
        Object.values(s.queries).some(q =>
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
          comparison = new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime();
        } else if (sort.field === 'name') {
          comparison = a.name.localeCompare(b.name);
        } else if (sort.field === 'conversations') {
          const firstSessionConversationCount = new Set(Object.values(a.queries).map(q => q.conversationId).filter(Boolean)).size;
          const secondSessionConversationCount = new Set(Object.values(b.queries).map(q => q.conversationId).filter(Boolean)).size;
          comparison = firstSessionConversationCount - secondSessionConversationCount;
        }
        return sort.direction === 'asc' ? comparison : -comparison;
      });
    }

    const total = sessions.length;
    const startIndex = params.cursor || 0;
    const endIndex = startIndex + params.limit;
    const items = sessions.slice(startIndex, endIndex);
    const hasMore = endIndex < total;
    const nextCursor = hasMore ? endIndex : undefined;

    return {
      items,
      total,
      hasMore,
      nextCursor,
    };
  }

  getQueryByConversationId(conversationId: string): (QueryEntry & { sessionId: string }) | undefined {
    for (const [sessionId, session] of Object.entries(this.store.sessions)) {
      for (const query of Object.values(session.queries)) {
        if (query.conversationId === conversationId) {
          return { ...query, sessionId };
        }
      }
    }
    return undefined;
  }

  save(): void {
    if (!this.path) return;
    try {
      const dir = dirname(this.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(this.path, JSON.stringify(this.store, null, 2));
    } catch (e) {
      console.error(`[Sessions] failed to save:`, e);
    }
  }

  delete(): void {
    this.store = { sessions: {} };
    this.save();
  }

  subscribe(callback: (data: { sessionId: string; queryName: string }) => void): () => void {
    this.emitter.on('upsert', callback);
    return () => this.emitter.off('upsert', callback);
  }
}
