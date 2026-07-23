import {EventEmitter} from 'node:events';
import type postgres from 'postgres';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {Db} from '@ark-broker/db/db.js';
import {DEFAULT_LIMIT, type PaginationParams} from '../pagination.js';
import {
  QueryPhases,
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
  deriveParticipants,
  isActivePhase,
  normalizeEventData,
  patchConversationForQuery,
  resolveQueryPhase,
  updateExistingQuery,
} from './session-aggregate.js';

const NOTIFY_CHANNEL = 'sessions_updated';

type SessionRow = {
  session_id: string;
  name: string;
  status: string;
  error_count: number;
  active_count: number;
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

/**
 * Postgres-backed SessionsStorage. Unlike the v1 design this replaces,
 * queries live in their own `session_queries` row per query instead of a
 * JSONB blob on the session header - an event/message for one query locks
 * and rewrites one small row, not the whole session. The header row keeps
 * incrementally-maintained aggregates (status/error_count/active_count/
 * conversations/participants), patched in place rather than recomputed
 * from every query on each write. See session-aggregate.ts for the pure
 * patch functions this delegates to.
 *
 * Two independent watermarks (last_applied_event_sequence on the query row,
 * last_applied_message_sequence) guard against a redelivered or reordered
 * event/message regressing state a later one already applied - necessary
 * here because, unlike the in-memory backend, the mutation runs in its own
 * transaction rather than trusting single-process in-order delivery.
 */
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

  /**
   * Resolves once the LISTEN registration for cross-replica notify has
   * completed. Production code doesn't need this (a notify that arrives
   * before setup finishes is simply missed, and self-heals on the next
   * mutation via getReplay); tests await it so subscribe assertions aren't
   * racing the async listen handshake.
   */
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
   * Locks the session header row. Callers must do this BEFORE any write to
   * session_queries in the same transaction (an INSERT there checks the
   * foreign key against sessions and takes an implicit FOR KEY SHARE lock
   * on this same row) - otherwise two concurrent transactions writing
   * different queries in the same session each pick up that FOR KEY SHARE
   * first, then both try to upgrade to FOR UPDATE here and deadlock. Taking
   * FOR UPDATE first means the later FK check just confirms a lock this
   * transaction already holds.
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
   * Patches the session header's incremental aggregates (error/active
   * counts, status, conversations, participants) for one query's write,
   * using a header row already locked by lockHeader. The merge itself runs
   * in JS over the small conversations array - not the O(all queries)
   * rescan the in-memory backend's recalculateSessionStatus performs.
   */
  private async patchHeader(
    sql: postgres.TransactionSql,
    header: SessionRow,
    now: string,
    entry: QueryEntry,
    deltas: {activeDelta: number; errorDelta: number; isNewlyAssigned: boolean}
  ): Promise<void> {
    const conversations = header.conversations as ConversationSummary[];

    const patchedConversations = patchConversationForQuery(
      conversations,
      entry,
      {isNewlyAssigned: deltas.isNewlyAssigned, errorDelta: deltas.errorDelta}
    );
    const participants = deriveParticipants(patchedConversations);

    const newActiveCount = header.active_count + deltas.activeDelta;
    const status =
      newActiveCount > 0
        ? 'active'
        : entry.phase === QueryPhases.Error
          ? 'error'
          : 'idle';

    await sql`
      UPDATE sessions SET
        error_count = error_count + ${deltas.errorDelta},
        active_count = active_count + ${deltas.activeDelta},
        status = ${status},
        last_activity = ${now},
        expires_at = now() + make_interval(secs => ${this.ttlSeconds}),
        conversations = ${sql.json(patchedConversations as unknown as postgres.JSONValue)},
        participants = ${sql.json(participants as unknown as postgres.JSONValue)}
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

      // Must lock the header before writing session_queries below - see
      // lockHeader's docstring for why the order matters.
      const header = await this.lockHeader(sql, sessionId);

      const now = new Date().toISOString();
      const wasActive = existingRow
        ? isActivePhase(existingRow.phase as QueryPhase)
        : false;
      const wasError = existingRow
        ? existingRow.phase === QueryPhases.Error
        : false;
      const hadConversationId = Boolean(existingRow?.conversation_id);

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

      const isActive = isActivePhase(entry.phase);
      const isError = entry.phase === QueryPhases.Error;

      await this.patchHeader(sql, header, now, entry, {
        activeDelta: (isActive ? 1 : 0) - (wasActive ? 1 : 0),
        errorDelta: (isError ? 1 : 0) - (wasError ? 1 : 0),
        isNewlyAssigned: !hadConversationId && Boolean(entry.conversationId),
      });

      return true;
    });

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

      // Lock the header in the same order applyEvent does, before touching
      // session_queries - see lockHeader's docstring.
      const header = await this.lockHeader(sql, existingRow.session_id);

      const now = new Date().toISOString();
      const hadConversationId = Boolean(existingRow.conversation_id);
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

      const entry = rowToQueryEntry(existingRow);
      entry.conversationId = resolvedConversationId;
      entry.lastActivity = now;

      await this.patchHeader(sql, header, now, entry, {
        activeDelta: 0,
        errorDelta: 0,
        isNewlyAssigned: !hadConversationId,
      });
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

    const queriesBySession = new Map<string, SessionQueryRow[]>();
    for (const row of queryRows) {
      const list = queriesBySession.get(row.session_id) ?? [];
      list.push(row);
      queriesBySession.set(row.session_id, list);
    }

    const sessions: Record<string, SessionEntry> = {};
    for (const header of headerRows) {
      sessions[header.session_id] = rowsToSessionEntry(
        header,
        queriesBySession.get(header.session_id) ?? []
      );
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
    const queriesBySession = new Map<string, SessionQueryRow[]>();
    for (const row of queryRows) {
      const list = queriesBySession.get(row.session_id) ?? [];
      list.push(row);
      queriesBySession.set(row.session_id, list);
    }

    const items = pageHeaders.map((header) =>
      rowsToSessionEntry(header, queriesBySession.get(header.session_id) ?? [])
    );

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
    // session_queries rows cascade via ON DELETE CASCADE
    await this.db`DELETE FROM sessions`;
  }

  subscribe(
    callback: (data: {sessionId: string; queryName: string}) => void
  ): () => void {
    this.emitter.on('upsert', callback);
    return () => this.emitter.off('upsert', callback);
  }
}
