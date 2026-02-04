export interface StreamEntry {
  id: string;
  timestamp: string;
  data: unknown;
}

const DISPLAY_NAME_KEYS = [
  'input',
  'message',
  'content',
  'prompt',
  'query',
  'text',
] as const;
const MAX_DISPLAY_LENGTH = 48;

function getFirstEntryText(data: unknown): string | undefined {
  if (data == null || typeof data !== 'object') return undefined;
  const obj = data as Record<string, unknown>;
  for (const key of DISPLAY_NAME_KEYS) {
    const val = obj[key];
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    if (
      typeof val === 'object' &&
      val !== null &&
      Array.isArray(val) &&
      val.length > 0
    ) {
      const first = val[0] as Record<string, unknown> | undefined;
      if (first && typeof first.text === 'string' && first.text.trim().length > 0)
        return first.text.trim();
    }
  }
  const inner = obj?.data as Record<string, unknown> | undefined;
  if (inner) {
    for (const key of DISPLAY_NAME_KEYS) {
      const val = inner[key];
      if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    }
  }
  return undefined;
}

export function getSessionDisplayNameFromEntries(
  entries: StreamEntry[],
  sessionId: string,
): string {
  if (entries.length === 0) return sessionId;
  const text = getFirstEntryText(entries[0].data);
  if (!text) return sessionId;
  if (text.length <= MAX_DISPLAY_LENGTH) return text;
  return text.slice(0, MAX_DISPLAY_LENGTH - 3) + '...';
}

export function extractQueryIdAndSessionId(entry: StreamEntry): {
  queryId: string | undefined;
  sessionId: string | undefined;
} {
  const outerData = entry.data as Record<string, unknown>;
  const innerData = outerData?.data as Record<string, unknown>;

  let queryId =
    (innerData?.queryName as string) ||
    (innerData?.queryId as string) ||
    (outerData?.query_id as string);

  let spans = outerData?.spans as Array<Record<string, unknown>>;
  if (!spans) {
    if (outerData?.attributes) {
      spans = [outerData];
    }
  }
  let sessionId: string | undefined;
  if (spans && spans.length > 0) {
    for (const span of spans) {
      const attributes = span?.attributes as Array<Record<string, unknown>>;
      if (attributes) {
        const queryAttr = attributes.find(attr => attr?.key === 'query.name');
        if (queryAttr?.value) {
          queryId = queryAttr.value as string;
        }
        const sessionAttr = attributes.find(attr => attr?.key === 'session.id');
        if (sessionAttr?.value) {
          sessionId = sessionAttr.value as string;
          break;
        }
      }
    }
  }

  if (!sessionId) {
    if (innerData?.sessionId) {
      sessionId = innerData.sessionId as string;
    } else {
      let ark = outerData?.ark as Record<string, unknown>;
      if (!ark) {
        const chunk = innerData?.chunk as Record<string, unknown>;
        ark = chunk?.ark as Record<string, unknown>;
      }
      if (ark?.session) {
        sessionId = ark.session as string;
      }
      if (ark?.completedQuery) {
        const completedQuery = ark.completedQuery as Record<string, unknown>;
        const spec = completedQuery?.spec as Record<string, unknown>;
        if (spec?.sessionId) {
          sessionId = spec.sessionId as string;
        }
      }
    }
  }

  return { queryId, sessionId };
}

export function sortEntriesByTimestampAndSequence(
  entries: StreamEntry[],
): StreamEntry[] {
  return [...entries].sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    const timeDiff = aTime - bTime;

    if (timeDiff !== 0) {
      return timeDiff;
    }

    const aData = a.data as Record<string, unknown>;
    const bData = b.data as Record<string, unknown>;
    const aSeq =
      typeof aData?.sequenceNumber === 'number' ? aData.sequenceNumber : 0;
    const bSeq =
      typeof bData?.sequenceNumber === 'number' ? bData.sequenceNumber : 0;
    return aSeq - bSeq;
  });
}

export function groupEntriesBySession(
  entries: StreamEntry[],
  queryToSessionMap: Record<string, string>,
): Record<string, StreamEntry[]> {
  return entries.reduce(
    (acc, entry) => {
      const { queryId, sessionId: extractedSessionId } =
        extractQueryIdAndSessionId(entry);

      let sessionId = extractedSessionId;

      if (queryId && sessionId) {
        queryToSessionMap[queryId] = sessionId;
      }

      if (queryId && !sessionId) {
        sessionId = queryToSessionMap[queryId];
      }

      const finalSessionId = sessionId || 'unknown';

      if (!acc[finalSessionId]) {
        acc[finalSessionId] = [];
      }
      acc[finalSessionId].push(entry);
      return acc;
    },
    {} as Record<string, StreamEntry[]>,
  );
}
