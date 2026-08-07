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
