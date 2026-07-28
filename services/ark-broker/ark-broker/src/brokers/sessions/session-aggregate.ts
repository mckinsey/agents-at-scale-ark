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

/**
 * Fills the still-empty identity fields and bumps lastActivity. Every rule here
 * is first-write-wins, so this is safe to apply out of order: an older event can
 * only fill a gap, never overwrite. Returns whether it changed anything, which
 * lets a caller tell a genuinely new event from a bare redelivery.
 *
 * lastActivity is the wall clock of this apply, not the event's own time, so it
 * still moves forward when an older event is merged late.
 */
export function mergeQueryMetadata(
  existing: QueryEntry,
  eventData: Partial<SessionEventData>,
  now: string
): boolean {
  let filled = false;

  if (eventData.conversationId && !existing.conversationId) {
    existing.conversationId = eventData.conversationId;
    filled = true;
  }
  if (eventData.agent && !existing.agent) {
    existing.agent = eventData.agent;
    filled = true;
  }
  if (eventData.team && !existing.team) {
    existing.team = eventData.team;
    filled = true;
  }
  if (eventData.tool && !existing.tool) {
    existing.tool = eventData.tool;
    filled = true;
  }
  if (eventData.targetType && existing.targetType === 'agent') {
    existing.targetType = eventData.targetType;
    filled = true;
  }

  if (filled) existing.lastActivity = now;
  return filled;
}

/**
 * The order-sensitive half. `done` clearing a prior `error` is the one rule that
 * is not monotonic, which is why an out-of-order event must not reach this -
 * an older `done` would erase a newer `error`.
 */
export function applyQueryPhase(
  existing: QueryEntry,
  phase: QueryPhase,
  now: string,
  errorMsg?: string
): void {
  existing.lastActivity = now;

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

export function updateExistingQuery(
  existing: QueryEntry,
  phase: QueryPhase,
  eventData: Partial<SessionEventData>,
  errorMsg?: string
): void {
  const now = new Date().toISOString();
  mergeQueryMetadata(existing, eventData, now);
  applyQueryPhase(existing, phase, now, errorMsg);
}

export function calculateDuration(start: string, end?: string): string {
  if (!end) return 'ongoing';
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
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

/** One participant per conversation, named after that conversation. */
export function deriveParticipants(
  conversations: ConversationSummary[] | undefined
): Participant[] {
  const byName = new Map<string, Participant>();
  for (const conv of conversations ?? []) {
    if (byName.has(conv.name)) continue;
    byName.set(conv.name, {
      id: conv.name,
      name: conv.name,
      type: conv.participantType || 'agent',
    });
  }
  return Array.from(byName.values());
}

function recalculateParticipants(session: SessionEntry): void {
  session.participants = deriveParticipants(session.conversations);
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
