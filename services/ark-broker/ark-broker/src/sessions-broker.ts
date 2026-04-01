import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import type { QueryPhase, SessionEventData } from './types.js';
import { QueryPhases, EventReasons, ERROR_REASON_SUFFIX } from './types.js';

export interface QueryEntry {
  /** Query resource name from the Ark CRD */
  name: string;
  /** Kubernetes namespace the query belongs to */
  namespace?: string;
  /** Conversation ID assigned by the memory broker */
  conversationId?: string;
  /** Name of the agent handling this query */
  agent?: string;
  /** CRD target type, currently always 'agent' */
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

  private updateExistingQuery(existing: QueryEntry, phase: QueryPhase, agent?: string, conversationId?: string, errorMsg?: string): void {
    const now = new Date().toISOString();
    existing.lastActivity = now;
    if (conversationId && !existing.conversationId) {
      existing.conversationId = conversationId;
    }
    if (agent && !existing.agent) {
      existing.agent = agent;
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
    const { conversationId, agent, queryNamespace } = eventData;
    const reason = eventData._reason || '';
    const errorMsg = eventData.error;

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
      this.updateExistingQuery(existing, queryPhase, agent, conversationId, errorMsg);
    } else {
      session.queries[queryName] = {
        name: queryName,
        namespace: queryNamespace,
        conversationId: conversationId || undefined,
        agent,
        targetType: 'agent',
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
