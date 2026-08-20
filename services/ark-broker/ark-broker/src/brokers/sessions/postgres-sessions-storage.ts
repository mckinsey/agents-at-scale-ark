import {EventEmitter} from 'node:events';
import type postgres from 'postgres';
import type {Logger} from '@ark-broker/logging/logger.js';
import type {Db} from '@ark-broker/db/db.js';
import {DEFAULT_LIMIT, type PaginationParams} from '../pagination.js';
import {
  type ConversationSummary,
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
  applyQueryPhase,
  buildQueryEntry,
  deriveParticipants,
  isTerminalPhase,
  mergeQueryMetadata,
  normalizeEventData,
  recalculateSessionConversations,
  recalculateSessionStatus,
  resolveQueryPhase,
} from './session-aggregate.js';

const NOTIFY_CHANNEL = 'sessions_updated';
const LISTEN_RETRY_INITIAL_MS = 500;
const LISTEN_RETRY_MAX_MS = 30_000;

type SessionRow = {
  session_id: string;
  name: string;
  status: string;
  error_count: number;
  created_at: Date;
  last_activity: Date;
  expires_at: Date;
  conversations: unknown;
};

type SessionQueryRow = {
  session_id: string;
  query_id: string;
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
  last_phase_event_sequence: string;
};

function rowToQueryEntry(row: SessionQueryRow): QueryEntry {
  return {
    name: row.query_id,
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
    conversations: header.conversations as ConversationSummary[],
    participants: deriveParticipants(
      header.conversations as ConversationSummary[]
    ),
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

  /**
   * Retries forever with backoff. postgres.js re-registers channels when an
   * established listen connection drops, but if the very first attempt fails -
   * a replica booting during a failover, say - there is nothing registered to
   * re-register, and that pod serves reads normally while never delivering a
   * live update again.
   */
  private async startListening(): Promise<void> {
    let delayMs = LISTEN_RETRY_INITIAL_MS;
    for (;;) {
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
        return;
      } catch (err) {
        this.logger.error(
          {err, retryInMs: delayMs},
          'failed to listen for session notifications, retrying'
        );
        await new Promise((resolve) => {
          setTimeout(resolve, delayMs).unref();
        });
        delayMs = Math.min(delayMs * 2, LISTEN_RETRY_MAX_MS);
      }
    }
  }

  /**
   * Every write path must take this first, before it so much as reads
   * session_queries. Two reasons, and both are load-bearing:
   *
   * An INSERT into session_queries takes an implicit FOR KEY SHARE on this row
   * via the foreign key, so locking the header afterwards lets two writers on
   * one session deadlock upgrading that lock.
   *
   * And reading the query row first is not safe either: FOR UPDATE on a row
   * that does not exist yet locks nothing, so both writers read "no such
   * query", and the one that commits second overwrites the first's fields
   * from its own stale view. Serializing here means the second writer reads
   * the row the first one just wrote.
   */
  private async lockHeader(
    sql: postgres.TransactionSql,
    sessionId: string
  ): Promise<SessionRow | undefined> {
    const headerRows = await sql<SessionRow[]>`
      SELECT * FROM sessions WHERE session_id = ${sessionId} FOR UPDATE
    `;
    return headerRows[0];
  }

  /**
   * The caller's INSERT ... ON CONFLICT DO NOTHING takes no lock when the row
   * already exists, so a purge can commit between it and the lock and leave
   * this write with no parent row - the query insert would then trip the
   * foreign key. Recreating it is the same outcome the event would have had if
   * it had arrived a moment later, so recover rather than fail. ON CONFLICT DO
   * UPDATE both locks and returns the row, so this cannot come back empty.
   */
  private async lockHeaderOrRecreate(
    sql: postgres.TransactionSql,
    sessionId: string,
    name: string
  ): Promise<SessionRow> {
    const header = await this.lockHeader(sql, sessionId);
    if (header) return header;

    const recreated = await sql<SessionRow[]>`
      INSERT INTO sessions (session_id, name, expires_at)
      VALUES (${sessionId}, ${name}, now() + make_interval(secs => ${this.ttlSeconds}))
      ON CONFLICT (session_id) DO UPDATE SET name = EXCLUDED.name
      RETURNING *
    `;
    return recreated[0]!;
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
    now: string,
    conversationsOnly = false
  ): Promise<void> {
    const rows = await sql<SessionQueryRow[]>`
      SELECT * FROM session_queries
      WHERE session_id = ${header.session_id}
      ORDER BY created_at, query_id
    `;

    const session = rowsToSessionEntry(header, rows);
    if (conversationsOnly) {
      recalculateSessionConversations(session);
    } else {
      recalculateSessionStatus(session);
    }

    await sql`
      UPDATE sessions SET
        error_count = ${session.errorCount ?? 0},
        status = ${session.status ?? 'idle'},
        last_activity = ${now},
        expires_at = now() + make_interval(secs => ${this.ttlSeconds}),
        conversations = ${sql.json((session.conversations ?? []) as unknown as postgres.JSONValue)}
      WHERE session_id = ${header.session_id}
    `;
  }

  /**
   * Recomputes the aggregates from the remaining query rows without touching
   * last_activity or expires_at. refreshHeader cannot serve this: it moves both
   * on every call, so a delete would register as activity and would revive an
   * expired session back into the list.
   */
  private async refreshHeaderAggregates(
    sql: postgres.TransactionSql,
    header: SessionRow
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
        conversations = ${sql.json((session.conversations ?? []) as unknown as postgres.JSONValue)}
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

      const header = await this.lockHeaderOrRecreate(sql, sessionId, name);

      // After the header lock, never before: the INSERT above takes no lock
      // when the row already exists, and FOR UPDATE on a query row that does
      // not exist yet locks nothing, so reading first lets two writers both
      // see "no such query" and the second one overwrite the first's fields.
      const existingRows = await sql<SessionQueryRow[]>`
        SELECT * FROM session_queries
        WHERE session_id = ${sessionId} AND query_id = ${queryName}
        FOR UPDATE
      `;
      const existingRow = existingRows[0];

      // Two independent watermarks. `stale` (the all-events one) guards
      // metadata order and which query wins the session-status election. A
      // separate phase watermark, advanced only by terminal events, guards the
      // phase: a reordered non-terminal event bumps `last_applied_event_sequence`
      // but not the phase watermark, so the query's own `done` - applied after
      // it with a lower sequence - is not mistaken for a replay and dropped.
      const stale =
        existingRow !== undefined &&
        sequence !== undefined &&
        sequence <= Number(existingRow.last_applied_event_sequence);
      const phaseStale =
        existingRow !== undefined &&
        sequence !== undefined &&
        sequence <= Number(existingRow.last_phase_event_sequence);
      // Only terminal events decide the phase, so only they move its watermark;
      // GREATEST keeps it from regressing and a 0 from a non-terminal event
      // leaves it untouched.
      const terminal = isTerminalPhase(queryPhase);
      const phaseSequence = terminal ? (sequence ?? 0) : 0;

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
        const filled = mergeQueryMetadata(entry, normalizedEventData);
        // Nothing left to do only when the metadata is stale, adds no field, and
        // this event decides no phase newer than the last one - a non-terminal
        // event never decides a phase, so it qualifies whenever it is stale.
        if (stale && !filled && (!terminal || phaseStale)) return false;
        if (!stale) {
          applyQueryPhase(entry, queryPhase, now, errorMsg);
        } else if (terminal && !phaseStale) {
          // Metadata-stale but newer than the last phase decision: write the
          // phase without re-electing this query as the session's latest
          // activity (a higher-sequence event already holds that election).
          applyQueryPhase(entry, queryPhase, now, errorMsg, false);
        }
      }

      await sql`
        INSERT INTO session_queries (
          session_id, query_id, namespace, conversation_id, agent,
          team, tool, target_type, phase, error, created_at, completed_at,
          last_activity, last_applied_event_sequence, last_phase_event_sequence
        ) VALUES (
          ${sessionId}, ${queryName}, ${entry.namespace ?? null},
          ${entry.conversationId ?? null}, ${entry.agent ?? null},
          ${entry.team ?? null}, ${entry.tool ?? null}, ${entry.targetType},
          ${entry.phase}, ${entry.error ?? null}, ${entry.createdAt},
          ${entry.completedAt ?? null}, ${entry.lastActivity},
          ${sequence ?? 0}, ${phaseSequence}
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
          -- Never regress: a merged-late event keeps the higher watermark, so
          -- the phase it was not allowed to write stays unreachable.
          last_applied_event_sequence = GREATEST(
            session_queries.last_applied_event_sequence,
            COALESCE(${sequence ?? null}::bigint, 0)
          ),
          last_phase_event_sequence = GREATEST(
            session_queries.last_phase_event_sequence,
            ${phaseSequence}::bigint
          )
      `;

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
    const touched = await this.db.begin(async (sql) => {
      // Callers know the query but not its session, so this unlocked probe
      // resolves the owner before taking any lock - keeping the header-first
      // order applyEvent uses. A query name can exist under more than one
      // session; pick one deterministically rather than locking every match.
      //
      // expires_at ranks rather than filters. Filtering it out would drop this
      // message for good, since nothing retries and applyEvent revives instead;
      // but ignoring it entirely would rank a dead session above a live one and
      // hand the message to the session that no longer owns the query. So a live
      // owner wins, and an expired one is used only when every owner is expired -
      // at which point refreshHeader revives it below.
      const owners = await sql<{session_id: string}[]>`
        SELECT sq.session_id FROM session_queries sq
        JOIN sessions s ON s.session_id = sq.session_id
        WHERE sq.query_id = ${queryId}
        ORDER BY (s.expires_at > now()) DESC, sq.session_id
        LIMIT 1
      `;
      const owner = owners[0];
      if (!owner) return;

      // A purge can have removed it since the probe above; its query rows
      // went with it, so there is nothing left to apply this message to.
      const header = await this.lockHeader(sql, owner.session_id);
      if (!header) return;

      const existingRows = await sql<SessionQueryRow[]>`
        SELECT * FROM session_queries
        WHERE session_id = ${owner.session_id} AND query_id = ${queryId}
        FOR UPDATE
      `;
      const existingRow = existingRows[0];
      if (!existingRow) return;

      if (
        sequence !== undefined &&
        sequence <= Number(existingRow.last_applied_message_sequence)
      ) {
        return;
      }

      const now = new Date().toISOString();
      const joinedConversation = !existingRow.conversation_id;
      const resolvedConversationId =
        existingRow.conversation_id ?? conversationId;

      // last_activity stays where the last event left it. It elects which
      // query's phase becomes the session status, and a message cannot change a
      // phase - so a message that moved it would hand a healthy query the
      // election on the next header refresh, over a newer failure elsewhere.
      // The session is still active; that is recorded on the header below.
      const updated = await sql<{query_id: string}[]>`
        UPDATE session_queries SET
          conversation_id = ${resolvedConversationId},
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

      await this.refreshHeader(sql, header, now, true);

      // Only a message that attaches the query to a conversation changes what a
      // watcher would render; the rest just moves the header's last_activity and
      // expires_at along, which is what the in-memory backend does silently too.
      return joinedConversation ? owner.session_id : undefined;
    });

    // refreshHeader just rewrote conversations and participants, so a watcher
    // that is not told would keep serving the previous list.
    if (touched) {
      await this.db.notify(
        NOTIFY_CHANNEL,
        JSON.stringify({sessionId: touched, queryName: queryId})
      );
    }
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

  async deleteQuery(queryId: string): Promise<number> {
    // Unlocked probe. No expires_at filter: an expired-but-present row is
    // exactly the durable leftover this exists to remove.
    const owners = await this.db<{session_id: string}[]>`
      SELECT DISTINCT session_id FROM session_queries
      WHERE query_id = ${queryId}
      ORDER BY session_id
    `;

    let removed = 0;
    const survivors: string[] = [];

    // One transaction per owning session, each locking a single header. A
    // transaction spanning several would be the only thing here that could
    // deadlock against the write paths, which lock one. Idempotent, so the
    // finalizer's retry after a partial failure is safe.
    for (const {session_id: sessionId} of owners) {
      const outcome = await this.db.begin(async (sql) => {
        // Header before the query row, the order both write paths take.
        const header = await this.lockHeader(sql, sessionId);
        if (!header) return undefined;

        const deleted = await sql<{query_id: string}[]>`
          DELETE FROM session_queries
          WHERE session_id = ${sessionId} AND query_id = ${queryId}
          RETURNING query_id
        `;
        if (deleted.length === 0) return undefined;

        // In this transaction, so it sees this transaction's own DELETE: read on
        // the pool it would still count the row just removed and the header
        // would never be dropped. Concurrent inserts are not the concern here -
        // the header lock above already excludes them.
        const [remaining] = await sql<[{n: string}]>`
          SELECT count(*)::text AS n FROM session_queries
          WHERE session_id = ${sessionId}
        `;
        if (Number(remaining!.n) === 0) {
          await sql`DELETE FROM sessions WHERE session_id = ${sessionId}`;
          return {count: deleted.length, survived: false};
        }

        await this.refreshHeaderAggregates(sql, header);
        return {count: deleted.length, survived: true};
      });

      if (!outcome) continue;
      removed += outcome.count;
      if (outcome.survived) survivors.push(sessionId);
    }

    // After commit, on the pool: notifying inside db.begin() deadlocks
    // postgres.js's own pool. Only survivors, since a session that is gone
    // yields no SSE frame anyway - the stream drops a getSession that misses.
    for (const sessionId of survivors) {
      await this.db.notify(
        NOTIFY_CHANNEL,
        JSON.stringify({sessionId, queryName: queryId})
      );
    }

    return removed;
  }

  subscribe(
    callback: (data: {sessionId: string; queryName: string}) => void
  ): () => void {
    this.emitter.on('upsert', callback);
    return () => this.emitter.off('upsert', callback);
  }
}
