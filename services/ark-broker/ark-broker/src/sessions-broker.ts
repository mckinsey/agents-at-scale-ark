import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { EventEmitter } from 'events';

export interface QueryEntry {
  name: string;
  namespace?: string;
  conversationId?: string;
  agent?: string;
  targetType: string;
  phase: 'pending' | 'running' | 'done' | 'error' | 'canceled' | 'unknown';
  error?: string;
  createdAt: string;
  completedAt?: string;
  lastActivity: string;
}

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

export class SessionsBroker {
  private store: SessionsStore = { sessions: {} };
  private emitter = new EventEmitter();
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private path?: string) {
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
        if (data && data.sessions) {
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

  ingestEvent(eventData: Record<string, unknown>): void {
    const sessionId = eventData.sessionId as string | undefined;
    const queryName = eventData.queryName as string | undefined;
    if (!sessionId || !queryName) return;

    const now = new Date().toISOString();
    const conversationId = eventData.conversationId as string | undefined;
    const agent = eventData.agent as string | undefined;
    const queryNamespace = eventData.queryNamespace as string | undefined;
    const reason = (eventData._reason as string) || '';
    const errorMsg = eventData.error as string | undefined;

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

    let queryPhase: 'pending' | 'running' | 'done' | 'error' | 'canceled' | 'unknown' = 'running';
    if (reason === 'QueryExecutionComplete') {
      queryPhase = errorMsg ? 'error' : 'done';
    } else if (reason.includes('Error')) {
      queryPhase = 'error';
    }

    const existing = session.queries[queryName];
    if (existing) {
      existing.lastActivity = now;
      if (conversationId && !existing.conversationId) {
        existing.conversationId = conversationId;
      }
      if (agent && !existing.agent) {
        existing.agent = agent;
      }
      if (queryPhase === 'error') {
        existing.phase = 'error';
        existing.error = errorMsg;
        existing.completedAt = now;
      } else if (queryPhase === 'done' && existing.phase !== 'error') {
        existing.phase = 'done';
        existing.completedAt = now;
      }
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
        completedAt: queryPhase !== 'running' ? now : undefined,
        lastActivity: now,
      };
    }

    this.deferredSave();
    this.emitter.emit('upsert', { sessionId, queryName });
  }

  ingestMessage(conversationId: string, queryId: string): void {
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
