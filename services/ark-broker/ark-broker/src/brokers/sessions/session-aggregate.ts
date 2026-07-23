import {
  CANCELED_REASON_SUFFIX,
  ERROR_REASON_SUFFIX,
  EventReasons,
  QueryPhases,
  type ConversationSummary,
  type Participant,
  type ParticipantType,
  type QueryEntry,
  type QueryPhase,
  type SessionEntry,
  type SessionEventData,
} from '../sessions-broker.js';

/**
 * Pure per-query merge logic shared by every SessionsStorage backend:
 * resolveQueryPhase/updateExistingQuery/buildQueryEntry/normalizeEventData
 * operate on a single QueryEntry and don't care where it's stored, so both
 * the in-memory backend and PostgresSessionsStorage apply an event/message
 * with identical semantics.
 *
 * recalculateSessionStatus/Conversations/Participants below are different:
 * they recompute session-wide aggregates from a full set of queries, which
 * only the in-memory backend still does this way (a full JS rescan is cheap
 * for a single process). PostgresSessionsStorage keeps those aggregates on
 * the sessions header row and updates them incrementally in SQL instead of
 * calling these - see postgres-sessions-storage.ts.
 */

export function resolveQueryPhase(
  reason: string,
  errorMsg?: string
): QueryPhase {
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

export function normalizeEventData(
  eventData: Partial<SessionEventData>
): Partial<SessionEventData> {
  // Map toolName to tool for backward compatibility with completions executor
  return {
    ...eventData,
    tool:
      eventData.tool ||
      (eventData as Partial<SessionEventData> & {toolName?: string}).toolName,
  };
}

export function buildQueryEntry(
  queryName: string,
  now: string,
  phase: QueryPhase,
  eventData: Partial<SessionEventData>,
  errorMsg?: string
): QueryEntry {
  return {
    name: queryName,
    namespace: eventData.queryNamespace,
    conversationId: eventData.conversationId || undefined,
    agent: eventData.agent,
    team: eventData.team,
    tool: eventData.tool,
    targetType: eventData.targetType || 'agent',
    phase,
    error: errorMsg,
    createdAt: now,
    completedAt: phase === QueryPhases.Running ? undefined : now,
    lastActivity: now,
  };
}

export function updateExistingQuery(
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

export function calculateDuration(start: string, end?: string): string {
  if (!end) return 'ongoing';
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export function isActivePhase(phase: QueryPhase): boolean {
  return phase === QueryPhases.Running || phase === QueryPhases.Pending;
}

/**
 * Incremental counterpart to recalculateConversations/Participants below,
 * for PostgresSessionsStorage: patches (or appends) the one conversation
 * entry a single query's write touches, instead of rebuilding the whole
 * array from every query in the session. `isNewlyAssigned` must be true
 * only the first time this query is attributed to `entry.conversationId`
 * (conversationId never changes once set - see updateExistingQuery) so
 * messageCount counts queries, not events.
 */
export function patchConversationForQuery(
  conversations: ConversationSummary[],
  entry: QueryEntry,
  options: {isNewlyAssigned: boolean; errorDelta: number}
): ConversationSummary[] {
  if (!entry.conversationId) return conversations;

  const index = conversations.findIndex(
    (c) => c.conversationId === entry.conversationId
  );

  if (index === -1) {
    const participantType: ParticipantType =
      entry.targetType === 'team'
        ? 'team'
        : entry.targetType === 'tool'
          ? 'tool'
          : 'agent';
    const participantName =
      entry.team || entry.agent || entry.tool || entry.conversationId;

    return [
      ...conversations,
      {
        conversationId: entry.conversationId,
        name: participantName,
        participants: [participantName],
        messageCount: 1,
        duration: calculateDuration(entry.createdAt, entry.completedAt),
        startTime: entry.createdAt,
        participantType,
        errorCount: entry.phase === QueryPhases.Error ? 1 : 0,
      },
    ];
  }

  const existing = conversations[index]!;
  const updated: ConversationSummary = {
    ...existing,
    messageCount: existing.messageCount + (options.isNewlyAssigned ? 1 : 0),
    errorCount: existing.errorCount + options.errorDelta,
    duration: entry.completedAt
      ? calculateDuration(existing.startTime, entry.completedAt)
      : existing.duration,
  };
  const next = conversations.slice();
  next[index] = updated;
  return next;
}

/**
 * Incremental counterpart to recalculateParticipants below: re-derives the
 * full participants list from the (small, already-patched) conversations
 * array. Cheap to run on every write since conversations is bounded by the
 * number of distinct conversations in a session, not by query count.
 */
export function deriveParticipants(
  conversations: ConversationSummary[]
): Participant[] {
  const seen = new Map<string, Participant>();
  for (const conv of conversations) {
    if (!seen.has(conv.name)) {
      seen.set(conv.name, {
        id: conv.name,
        name: conv.name,
        type: conv.participantType,
      });
    }
  }
  return Array.from(seen.values());
}

function recalculateConversations(session: SessionEntry): void {
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
      const errorCount = convQueries.filter((q) => q.phase === 'error').length;

      return {
        conversationId: convId,
        name: participantName,
        participants,
        messageCount,
        duration: calculateDuration(
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

function recalculateParticipants(session: SessionEntry): void {
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

export function recalculateSessionStatus(session: SessionEntry): void {
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

    session.status = latestQuery.phase === 'error' ? 'error' : 'idle';
  }

  recalculateConversations(session);
  recalculateParticipants(session);
}
