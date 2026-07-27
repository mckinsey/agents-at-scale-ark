import {EventEmitter} from 'node:events';
import type postgres from 'postgres';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {Db} from '@ark-broker/db/db.js';
import {DEFAULT_LIMIT, type PaginationParams} from '../pagination.js';
import {
  type ConversationSummary,
  type Participant,
  type PaginatedSessionsList,
  type QueryEntry,
  type QueryPhase,
  type SessionEntry,
  type SessionEventData,
  type SessionsFilter,
  type SessionsSort,
  type SessionsStorage,
  type SessionsStore,
} from '../sessions-broker.js';
import {
  buildQueryEntry,
  normalizeEventData,
  recalculateSessionStatus,
  resolveQueryPhase,
  updateExistingQuery,
} from './session-aggregate.js';

const NOTIFY_CHANNEL = 'sessions_updated';

type SessionRow = {
  session_id: string;
  name: string;
  status: string;
  error_count: number;
  created_at: Date;
  last_activity: Date;
  expires_at: Date;
  participants: unknown;
  conversations: unknown;
};

type SessionQueryRow = {
  session_id: string;
  query_id: string;
  name: string;
  namespace: string | null;
  conversation_id: string | null;
  agent: string | null;
  team: string | null;
  tool: string | null;
  target_type: string;
  phase: string;
  error: string | null;
  created_at: Date;
  completed_at: Date | null;
  last_activity: Date;
  last_applied_event_sequence: string;
  last_applied_message_sequence: string;
};

function rowToQueryEntry(row: SessionQueryRow): QueryEntry {
  return {
    name: row.name,
    namespace: row.namespace ?? undefined,
    conversationId: row.conversation_id ?? undefined,
    agent: row.agent ?? undefined,
    team: row.team ?? undefined,
    tool: row.tool ?? undefined,
    targetType: row.target_type,
    phase: row.phase as QueryPhase,
    error: row.error ?? undefined,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : undefined,
    lastActivity: row.last_activity.toISOString(),
  };
}

function rowsToSessionEntry(
  header: SessionRow,
  queryRows: SessionQueryRow[]
): SessionEntry {
  const queries: Record<string, QueryEntry> = {};
  for (const row of queryRows) {
    queries[row.query_id] = rowToQueryEntry(row);
  }
  return {
    sessionId: header.session_id,
    name: header.name,
    queries,
    status: header.status as 'active' | 'idle' | 'error',
    errorCount: header.error_count,
    participants: header.participants as Participant[],
    conversations: header.conversations as ConversationSummary[],
    createdAt: header.created_at.toISOString(),
    lastActivity: header.last_activity.toISOString(),
  };
}

function hydrateSessions(
  headers: SessionRow[],
  queryRows: SessionQueryRow[]
): SessionEntry[] {
  const bySession = new Map<string, SessionQueryRow[]>();
  for (const row of queryRows) {
    const list = bySession.get(row.session_id) ?? [];
    list.push(row);
    bySession.set(row.session_id, list);
  }
  return headers.map((header) =>
    rowsToSessionEntry(header, bySession.get(header.session_id) ?? [])
  );
}

export class PostgresSessionsStorage implements SessionsStorage {
  private readonly emitter = new EventEmitter();
  private readonly listening: Promise<void>;

  constructor(
    private readonly logger: Logger,
    private readonly db: Db,
    private readonly ttlSeconds: number
  ) {
    this.listening = this.startListening();
  }

  /** Tests await this so subscribe assertions don't race the LISTEN handshake. */
  async whenListening(): Promise<void> {
    return this.listening;
  }

  private async startListening(): Promise<void> {
    try {
      await this.db.listen(NOTIFY_CHANNEL, (payload) => {
        try {
          const data = JSON.parse(payload) as {
            sessionId: string;
            queryName: string;
          };
          this.emitter.emit('upsert', data);
        } catch (err) {
          this.logger.error({err}, 'failed to parse sessions notify payload');
        }
      });
    } catch (err) {
      this.logger.error({err}, 'failed to listen for session notifications');
    }
  }

  /**
   * Call BEFORE any write to session_queries in the same transaction: an
   * INSERT there takes an implicit FOR KEY SHARE on this same row via the
   * foreign key, so acquiring FOR UPDATE afterwards lets two transactions
   * writing different queries of one session deadlock upgrading the lock.
   */
  private async lockHeader(
    sql: postgres.TransactionSql,
    sessionId: string
  ): Promise<SessionRow> {
    const headerRows = await sql<SessionRow[]>`
      SELECT * FROM sessions WHERE session_id = ${sessionId} FOR UPDATE
    `;
    return headerRows[0]!;
  }

  /**
   * Recomputes the header's aggregates from the session's own query rows, via
   * the same pure function the in-memory backend uses, so the two backends
   * cannot drift apart and a wrong aggregate repairs itself on the next write.
   * Runs after the session_queries write, with the header already locked, so
   * it sees this transaction's own row and no concurrent writer's half-state.
   * Ordered by created_at because conversation startTime and duration are
   * taken from the first and last query of each conversation.
   */
  private async refreshHeader(
    sql: postgres.TransactionSql,
    header: SessionRow,
    now: string
  ): Promise<void> {
    const rows = await sql<SessionQueryRow[]>`
      SELECT * FROM session_queries
      WHERE session_id = ${header.session_id}
      ORDER BY created_at, query_id
    `;

    const session = rowsToSessionEntry(header, rows);
    recalculateSessionStatus(session);

    await sql`
      UPDATE sessions SET
        error_count = ${session.errorCount ?? 0},
        status = ${session.status ?? 'idle'},
        last_activity = ${now},
        expires_at = now() + make_interval(secs => ${this.ttlSeconds}),
        conversations = ${sql.json((session.conversations ?? []) as unknown as postgres.JSONValue)},
        participants = ${sql.json((session.participants ?? []) as unknown as postgres.JSONValue)}
      WHERE session_id = ${header.session_id}
    `;
  }

  async applyEvent(
    eventData: Partial<SessionEventData>,
    sequence?: number
  ): Promise<void> {
    const {sessionId, queryName} = eventData;
    if (!sessionId || !queryName) {
      this.logger.warn(
        {sessionId, queryName},
        'dropping event: missing sessionId or queryName'
      );
      return;
    }

    const reason = eventData._reason || '';
    const errorMsg = eventData.error;
    const normalizedEventData = normalizeEventData(eventData);
    const queryPhase = resolveQueryPhase(reason, errorMsg);
    const name = sessionId.startsWith('session-')
      ? sessionId.substring(8)
      : sessionId;

    const applied = await this.db.begin(async (sql) => {
      await sql`
        INSERT INTO sessions (session_id, name, expires_at)
        VALUES (${sessionId}, ${name}, now() + make_interval(secs => ${this.ttlSeconds}))
        ON CONFLICT (session_id) DO NOTHING
      `;

      const existingRows = await sql<SessionQueryRow[]>`
        SELECT * FROM session_queries
        WHERE session_id = ${sessionId} AND query_id = ${queryName}
        FOR UPDATE
      `;
      const existingRow = existingRows[0];

      if (
        existingRow &&
        sequence !== undefined &&
        sequence <= Number(existingRow.last_applied_event_sequence)
      ) {
        return false;
      }

      // Before the session_queries write below, never after - see lockHeader.
      const header = await this.lockHeader(sql, sessionId);

      const now = new Date().toISOString();
      const entry = existingRow
        ? rowToQueryEntry(existingRow)
        : buildQueryEntry(
            queryName,
            now,
            queryPhase,
            normalizedEventData,
            errorMsg
          );
      if (existingRow) {
        updateExistingQuery(entry, queryPhase, normalizedEventData, errorMsg);
      }

      const upserted = await sql<{query_id: string}[]>`
        INSERT INTO session_queries (
          session_id, query_id, name, namespace, conversation_id, agent,
          team, tool, target_type, phase, error, created_at, completed_at,
          last_activity, last_applied_event_sequence
        ) VALUES (
          ${sessionId}, ${queryName}, ${entry.name}, ${entry.namespace ?? null},
          ${entry.conversationId ?? null}, ${entry.agent ?? null},
          ${entry.team ?? null}, ${entry.tool ?? null}, ${entry.targetType},
          ${entry.phase}, ${entry.error ?? null}, ${entry.createdAt},
          ${entry.completedAt ?? null}, ${entry.lastActivity},
          ${sequence ?? 0}
        )
        ON CONFLICT (session_id, query_id) DO UPDATE SET
          namespace = EXCLUDED.namespace,
          conversation_id = EXCLUDED.conversation_id,
          agent = EXCLUDED.agent,
          team = EXCLUDED.team,
          tool = EXCLUDED.tool,
          target_type = EXCLUDED.target_type,
          phase = EXCLUDED.phase,
          error = EXCLUDED.error,
          completed_at = EXCLUDED.completed_at,
          last_activity = EXCLUDED.last_activity,
          last_applied_event_sequence = COALESCE(
            ${sequence ?? null}::bigint,
            session_queries.last_applied_event_sequence
          )
        WHERE ${sequence ?? null}::bigint IS NULL
          OR session_queries.last_applied_event_sequence < ${sequence ?? null}::bigint
        RETURNING query_id
      `;
      if (upserted.length === 0) return false;

      await this.refreshHeader(sql, header, now);

      return true;
    });

    // After the commit above, on the pool - notifying inside db.begin()
    // deadlocks postgres.js's own connection pool under concurrent load.
    if (applied) {
      await this.db.notify(
        NOTIFY_CHANNEL,
        JSON.stringify({sessionId, queryName})
      );
    }
  }

  async applyMessage(
    conversationId: string,
    queryId: string,
    sequence?: number
  ): Promise<void> {
    await this.db.begin(async (sql) => {
      const existingRows = await sql<SessionQueryRow[]>`
        SELECT * FROM session_queries WHERE query_id = ${queryId} FOR UPDATE
      `;
      const existingRow = existingRows[0];
      if (!existingRow) return;

      if (
        sequence !== undefined &&
        sequence <= Number(existingRow.last_applied_message_sequence)
      ) {
        return;
      }

      // Same order as applyEvent, or the two deadlock - see lockHeader.
      const header = await this.lockHeader(sql, existingRow.session_id);

      const now = new Date().toISOString();
      const resolvedConversationId =
        existingRow.conversation_id ?? conversationId;

      const updated = await sql<{query_id: string}[]>`
        UPDATE session_queries SET
          conversation_id = ${resolvedConversationId},
          last_activity = ${now},
          last_applied_message_sequence = COALESCE(
            ${sequence ?? null}::bigint,
            session_queries.last_applied_message_sequence
          )
        WHERE session_id = ${existingRow.session_id} AND query_id = ${queryId}
          AND (
            ${sequence ?? null}::bigint IS NULL
            OR last_applied_message_sequence < ${sequence ?? null}::bigint
          )
        RETURNING query_id
      `;
      if (updated.length === 0) return;

      await this.refreshHeader(sql, header, now);
    });
  }

  async getSession(sessionId: string): Promise<SessionEntry | undefined> {
    const headerRows = await this.db<SessionRow[]>`
      SELECT * FROM sessions WHERE session_id = ${sessionId} AND expires_at > now()
    `;
    const header = headerRows[0];
    if (!header) return undefined;

    const queryRows = await this.db<SessionQueryRow[]>`
      SELECT * FROM session_queries WHERE session_id = ${sessionId}
    `;
    return rowsToSessionEntry(header, queryRows);
  }

  async getAll(): Promise<SessionsStore> {
    const headerRows = await this.db<SessionRow[]>`
      SELECT * FROM sessions WHERE expires_at > now()
    `;
    const queryRows = await this.db<SessionQueryRow[]>`
      SELECT sq.* FROM session_queries sq
      JOIN sessions s ON s.session_id = sq.session_id
      WHERE s.expires_at > now()
    `;

    const sessions: Record<string, SessionEntry> = {};
    for (const entry of hydrateSessions(headerRows, queryRows)) {
      sessions[entry.sessionId] = entry;
    }
    return {sessions};
  }

  private sessionsWhere(filters?: SessionsFilter): postgres.Fragment {
    const search = filters?.search;
    return this.db`
      WHERE expires_at > now()
      ${filters?.status ? this.db`AND status = ${filters.status}` : this.db``}
      ${filters?.dateFrom ? this.db`AND last_activity >= ${filters.dateFrom}` : this.db``}
      ${filters?.dateTo ? this.db`AND last_activity <= ${filters.dateTo}` : this.db``}
      ${
        search
          ? this.db`AND (
              session_id ILIKE ${'%' + search + '%'}
              OR name ILIKE ${'%' + search + '%'}
              OR EXISTS (
                SELECT 1 FROM session_queries sq
                WHERE sq.session_id = sessions.session_id
                  AND (
                    sq.agent ILIKE ${'%' + search + '%'}
                    OR sq.team ILIKE ${'%' + search + '%'}
                    OR sq.tool ILIKE ${'%' + search + '%'}
                  )
              )
            )`
          : this.db``
      }
    `;
  }

  private orderByFor(sort?: SessionsSort): postgres.Fragment {
    const direction = sort?.direction === 'asc' ? this.db`ASC` : this.db`DESC`;
    if (sort?.field === 'name') return this.db`ORDER BY name ${direction}`;
    if (sort?.field === 'conversations') {
      return this.db`ORDER BY jsonb_array_length(conversations) ${direction}`;
    }
    return this.db`ORDER BY last_activity ${direction}`;
  }

  async paginate(
    params: PaginationParams,
    filters?: SessionsFilter,
    sort?: SessionsSort
  ): Promise<PaginatedSessionsList> {
    const limit = params.limit ?? DEFAULT_LIMIT;
    const offset = params.cursor ?? 0;

    const headerRows = await this.db<SessionRow[]>`
      SELECT * FROM sessions
      ${this.sessionsWhere(filters)}
      ${this.orderByFor(sort)}
      LIMIT ${limit + 1} OFFSET ${offset}
    `;

    const [counts] = await this.db<
      [{total: string; active: string; idle: string; error: string}]
    >`
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE status = 'active') AS active,
        count(*) FILTER (WHERE status = 'idle') AS idle,
        count(*) FILTER (WHERE status = 'error') AS error
      FROM sessions
      ${this.sessionsWhere(filters)}
    `;

    const hasMore = headerRows.length > limit;
    const pageHeaders = headerRows.slice(0, limit);

    const sessionIds = pageHeaders.map((h) => h.session_id);
    const queryRows = sessionIds.length
      ? await this.db<SessionQueryRow[]>`
          SELECT * FROM session_queries WHERE session_id = ANY(${sessionIds})
        `
      : [];
    const items = hydrateSessions(pageHeaders, queryRows);

    return {
      items,
      total: Number(counts!.total),
      hasMore,
      nextCursor: hasMore ? offset + limit : undefined,
      statusCounts: {
        active: Number(counts!.active),
        idle: Number(counts!.idle),
        error: Number(counts!.error),
      },
    };
  }

  async getQueryByConversationId(
    conversationId: string
  ): Promise<(QueryEntry & {sessionId: string}) | undefined> {
    const rows = await this.db<SessionQueryRow[]>`
      SELECT sq.* FROM session_queries sq
      JOIN sessions s ON s.session_id = sq.session_id
      WHERE sq.conversation_id = ${conversationId} AND s.expires_at > now()
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return undefined;
    return {...rowToQueryEntry(row), sessionId: row.session_id};
  }

  async save(): Promise<void> {
    // no-op: Postgres persists synchronously on write, no separate flush step
  }

  async delete(): Promise<void> {
    await this.db`DELETE FROM sessions`;
  }

  subscribe(
    callback: (data: {sessionId: string; queryName: string}) => void
  ): () => void {
    this.emitter.on('upsert', callback);
    return () => this.emitter.off('upsert', callback);
  }
}
