import {existsSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {EventEmitter} from 'node:events';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {PaginationParams, PaginatedList} from './pagination.js';

export type QueryPhase =
  | 'pending'
  | 'running'
  | 'done'
  | 'error'
  | 'canceled'
  | 'unknown';

export const QueryPhases = {
  Pending: 'pending',
  Running: 'running',
  Done: 'done',
  Error: 'error',
  Canceled: 'canceled',
  Unknown: 'unknown',
} as const satisfies Record<string, QueryPhase>;

export const EventReasons = {
  QueryExecutionComplete: 'QueryExecutionComplete',
  QueryExecutionCanceled: 'QueryExecutionCanceled',
  AgentExecutionStart: 'AgentExecutionStart',
} as const;

export const ERROR_REASON_SUFFIX = 'Error';
export const CANCELED_REASON_SUFFIX = 'Canceled';

export interface SessionEventData {
  sessionId: string;
  queryName: string;
  queryNamespace?: string;
  conversationId?: string;
  agent?: string;
  team?: string;
  tool?: string;
  targetType?: string;
  error?: string;
  _reason?: string;
}

export type ParticipantType = 'agent' | 'team' | 'tool';

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

export interface Participant {
  id: string;
  name: string;
  type: ParticipantType;
}

export interface ConversationSummary {
  conversationId: string;
  name: string;
  participants: string[];
  messageCount: number;
  duration: string;
  startTime: string;
  participantType: ParticipantType;
  errorCount: number;
}

/** A single session containing one or more queries grouped by session ID */
export interface SessionEntry {
  sessionId: string;
  name: string;
  queries: Record<string, QueryEntry>;
  status?: 'active' | 'idle' | 'error';
  errorCount?: number;
  participants?: Participant[];
  conversations?: ConversationSummary[];
  createdAt: string;
  lastActivity: string;
}

export interface SessionsStore {
  sessions: Record<string, SessionEntry>;
}

/** Paginated sessions list with status counts */
export interface PaginatedSessionsList extends PaginatedList<SessionEntry> {
  /** Status counts across all filtered results */
  statusCounts: {
    active: number;
    idle: number;
    error: number;
  };
}

/**
 * Live event-sourced materialized index of sessions and queries. Enriched as
 * events and messages flow through the broker. Consumers can subscribe via SSE
 * to watch sessions mutate in real-time, or poll/GET for post-hoc analysis.
 */
export class SessionsBroker {
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
      this.recalculateSessionStatus(sessionId);

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
        this.save();
        this.dirty = false;
      }
    }, 2000);
  }

  private resolveQueryPhase(reason: string, errorMsg?: string): QueryPhase {
    if (reason === EventReasons.QueryExecutionComplete) {
      return errorMsg ? QueryPhases.Error : QueryPhases.Done;
    }
    if (reason.includes(CANCELED_REASON_SUFFIX)) {
      return QueryPhases.Canceled;
    }
    if (reason.includes(ERROR_REASON_SUFFIX)) {
      return QueryPhases.Error;
    }
    return QueryPhases.Running;
  }

  private determineParticipantType(
    queries: QueryEntry[],
    participantName: string
  ): ParticipantType {
    const relevantQuery = queries.find(
      (q) =>
        q.team === participantName ||
        q.agent === participantName ||
        q.tool === participantName
    );

    if (!relevantQuery) return 'agent';

    if (relevantQuery.targetType === 'team') return 'team';
    if (relevantQuery.targetType === 'tool') return 'tool';
    if (relevantQuery.team === participantName) return 'team';
    if (relevantQuery.tool === participantName) return 'tool';

    return 'agent';
  }

  private calculateDuration(start: string, end?: string): string {
    if (!end) return 'ongoing';
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
  }

  private recalculateParticipants(sessionId: string): void {
    const session = this.store.sessions[sessionId];
    if (!session) return;

    // Derive participants from conversations instead of queries
    if (!session.conversations || session.conversations.length === 0) {
      session.participants = [];
      return;
    }

    // Get unique participant names from conversation names
    const participantNames = Array.from(
      new Set(session.conversations.map((conv) => conv.name))
    );

    session.participants = participantNames.map((name) => {
      // Find a conversation to get participant type
      const conv = session.conversations!.find((c) => c.name === name);

      return {
        id: name,
        name: name,
        type: conv?.participantType || 'agent',
      };
    });
  }

  private recalculateConversations(sessionId: string): void {
    const session = this.store.sessions[sessionId];
    if (!session) return;

    const queries = Object.values(session.queries);
    const conversationMap = new Map<string, QueryEntry[]>();

    queries.forEach((query) => {
      if (!query.conversationId) return;
      const existing = conversationMap.get(query.conversationId) || [];
      conversationMap.set(query.conversationId, [...existing, query]);
    });

    session.conversations = Array.from(conversationMap.entries()).map(
      ([convId, convQueries]) => {
        const participants = Array.from(
          new Set(
            convQueries.map((q) => q.team || q.agent || q.tool).filter(Boolean)
          )
        ) as string[];
        const participantName = participants[0] || convId;

        const firstQuery = convQueries[0];
        let participantType: ParticipantType = 'agent';
        if (firstQuery.targetType === 'team') {
          participantType = 'team';
        } else if (firstQuery.targetType === 'tool') {
          participantType = 'tool';
        }

        const messageCount = convQueries.length;
        const errorCount = convQueries.filter(
          (q) => q.phase === 'error'
        ).length;

        return {
          conversationId: convId,
          name: participantName,
          participants,
          messageCount,
          duration: this.calculateDuration(
            convQueries[0].createdAt,
            convQueries.at(-1)?.completedAt
          ),
          startTime: convQueries[0].createdAt,
          participantType,
          errorCount,
        };
      }
    );
  }

  private recalculateSessionStatus(sessionId: string): void {
    const session = this.store.sessions[sessionId];
    if (!session) return;

    const queries = Object.values(session.queries);

    if (queries.length === 0) {
      session.status = 'idle';
      session.errorCount = 0;
      session.participants = [];
      session.conversations = [];
      return;
    }

    session.errorCount = queries.filter((q) => q.phase === 'error').length;

    const hasActive = queries.some(
      (q) => q.phase === 'running' || q.phase === 'pending'
    );

    if (hasActive) {
      session.status = 'active';
    } else {
      const latestQuery = queries.reduce(
        (latest, q) =>
          new Date(q.lastActivity) > new Date(latest.lastActivity) ? q : latest,
        queries[0]
      );

      if (latestQuery.phase === 'error') {
        session.status = 'error';
      } else {
        session.status = 'idle';
      }
    }

    this.recalculateConversations(sessionId);
    this.recalculateParticipants(sessionId);
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
    } else if (
      phase === QueryPhases.Canceled &&
      existing.phase !== QueryPhases.Error
    ) {
      existing.phase = QueryPhases.Canceled;
      existing.completedAt = now;
    } else if (
      phase === QueryPhases.Done &&
      existing.phase !== QueryPhases.Canceled
    ) {
      // A later 'done' supersedes a prior 'error'. A query that paused for
      // tool approval is transiently recorded as error; once it completes
      // successfully the error must be cleared so errorCount reflects reality.
      existing.phase = QueryPhases.Done;
      existing.error = undefined;
      existing.completedAt = now;
    }
  }

  applyEvent(eventData: Partial<SessionEventData>): void {
    const {sessionId, queryName} = eventData;
    if (!sessionId || !queryName) {
      this.logger.warn(
        {sessionId, queryName},
        'dropping event: missing sessionId or queryName'
      );
      return;
    }

    const now = new Date().toISOString();
    const {queryNamespace} = eventData;
    const reason = eventData._reason || '';
    const errorMsg = eventData.error;

    // Map toolName to tool for backward compatibility with completions executor
    const normalizedEventData = {
      ...eventData,
      tool:
        eventData.tool ||
        (eventData as Partial<SessionEventData> & {toolName?: string}).toolName,
    };

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

    const queryPhase = this.resolveQueryPhase(reason, errorMsg);

    const existing = session.queries[queryName];
    if (existing) {
      this.updateExistingQuery(
        existing,
        queryPhase,
        normalizedEventData,
        errorMsg
      );
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
      this.queryToSession.set(queryName, sessionId);
    }

    this.recalculateSessionStatus(sessionId);

    this.deferredSave();
    this.emitter.emit('upsert', {sessionId, queryName});
  }

  applyMessage(conversationId: string, queryId: string): void {
    const sessionId = this.queryToSession.get(queryId);
    if (!sessionId) return;

    const session = this.store.sessions[sessionId];
    if (!session) return;

    const query = session.queries[queryId];
    if (!query) return;

    query.lastActivity = new Date().toISOString();
    if (!query.conversationId) {
      query.conversationId = conversationId;
    }
    session.lastActivity = query.lastActivity;
    this.deferredSave();
  }

  getAll(): SessionsStore {
    return this.store;
  }

  getSession(sessionId: string): SessionEntry | undefined {
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
  paginate(
    params: PaginationParams,
    filters?: {
      status?: 'active' | 'idle' | 'error';
      dateFrom?: string;
      dateTo?: string;
      search?: string;
    },
    sort?: {
      field: 'date' | 'name' | 'conversations';
      direction: 'asc' | 'desc';
    }
  ): PaginatedSessionsList {
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

  getQueryByConversationId(
    conversationId: string
  ): (QueryEntry & {sessionId: string}) | undefined {
    for (const [sessionId, session] of Object.entries(this.store.sessions)) {
      for (const query of Object.values(session.queries)) {
        if (query.conversationId === conversationId) {
          return {...query, sessionId};
        }
      }
    }
    return undefined;
  }

  save(): void {
    if (!this.path) return;
    try {
      const dir = dirname(this.path);
      if (!existsSync(dir)) mkdirSync(dir, {recursive: true});
      writeFileSync(this.path, JSON.stringify(this.store, null, 2));
    } catch (err) {
      this.logger.error({err}, 'failed to save');
    }
  }

  delete(): void {
    this.store = {sessions: {}};
    this.save();
  }

  subscribe(
    callback: (data: {sessionId: string; queryName: string}) => void
  ): () => void {
    this.emitter.on('upsert', callback);
    return () => this.emitter.off('upsert', callback);
  }
}
