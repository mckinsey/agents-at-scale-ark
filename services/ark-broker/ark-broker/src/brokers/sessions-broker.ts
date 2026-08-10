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
  /**
   * ISO timestamp of the most recent event for this query. Events only: this is
   * what elects whose phase becomes the session status, so a write that cannot
   * change a phase must not move it.
   */
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

          this.logger.info(
            {
              sessions: this.cachedItemCount(),
              queries: this.cachedQueryCount(),
            },
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
export interface SessionsFilter {
  status?: 'active' | 'idle' | 'error';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface SessionsSort {
  field: 'date' | 'name' | 'conversations';
  direction: 'asc' | 'desc';
}

export interface SessionsStorage {
  /**
   * `sequence` is the event's position in the events stream, used as an
   * idempotency watermark by backends that apply the mutation in a separate
   * transaction from the event insert, so concurrent replicas can't let an
   * older event regress state a later one already applied. The in-memory
   * backend ignores it: single process, no reorder risk.
   */
  applyEvent(
    eventData: Partial<SessionEventData>,
    sequence?: number
  ): Promise<void>;
  /** `sequence` is the message's position in the messages stream; see applyEvent. */
  applyMessage(
    conversationId: string,
    queryId: string,
    sequence?: number
  ): Promise<void>;
  getAll(): Promise<SessionsStore>;
  getSession(sessionId: string): Promise<SessionEntry | undefined>;
  paginate(
    params: PaginationParams,
    filters?: SessionsFilter,
    sort?: SessionsSort
  ): Promise<PaginatedSessionsList>;
  getQueryByConversationId(
    conversationId: string
  ): Promise<(QueryEntry & {sessionId: string}) | undefined>;
  save(): Promise<void>;
  delete(): Promise<void>;
  subscribe(
    callback: (data: {sessionId: string; queryName: string}) => void
  ): () => void;
}

/**
 * Live materialized index of sessions and queries, enriched as events and
 * messages flow through the broker. Consumers can subscribe via SSE to watch
 * sessions mutate in real-time, or poll/GET for post-hoc analysis.
 */
export class SessionsBroker {
  constructor(private readonly storage: SessionsStorage) {}

  async applyEvent(
    eventData: Partial<SessionEventData>,
    sequence?: number
  ): Promise<void> {
    return this.storage.applyEvent(eventData, sequence);
  }

  async applyMessage(
    conversationId: string,
    queryId: string,
    sequence?: number
  ): Promise<void> {
    return this.storage.applyMessage(conversationId, queryId, sequence);
  }

  async getAll(): Promise<SessionsStore> {
    return this.storage.getAll();
  }

  cachedItemCount(): number {
    return Object.keys(this.store.sessions).length;
  }

  cachedQueryCount(): number {
    return Object.values(this.store.sessions).reduce(
      (total, session) => total + Object.keys(session.queries).length,
      0
    );
  }

  getSession(sessionId: string): SessionEntry | undefined {
    return this.store.sessions[sessionId];
  async getSession(sessionId: string): Promise<SessionEntry | undefined> {
    return this.storage.getSession(sessionId);
  }

  async paginate(
    params: PaginationParams,
    filters?: SessionsFilter,
    sort?: SessionsSort
  ): Promise<PaginatedSessionsList> {
    return this.storage.paginate(params, filters, sort);
  }

  async getQueryByConversationId(
    conversationId: string
  ): Promise<(QueryEntry & {sessionId: string}) | undefined> {
    return this.storage.getQueryByConversationId(conversationId);
  }

  async save(): Promise<void> {
    return this.storage.save();
  }

  async delete(): Promise<void> {
    return this.storage.delete();
  }

  subscribe(
    callback: (data: {sessionId: string; queryName: string}) => void
  ): () => void {
    return this.storage.subscribe(callback);
  }
}
