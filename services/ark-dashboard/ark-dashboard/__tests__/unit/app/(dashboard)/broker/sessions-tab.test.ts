import { describe, expect, it } from 'vitest';
import {
  extractQueryIdAndSessionId,
  getSessionDisplayNameFromEntries,
  groupEntriesBySession,
  sortEntriesByTimestampAndSequence,
} from '@/lib/broker/session-utils';
import type { StreamEntry } from '@/lib/broker/session-utils';

describe('Sessions Tab Functionality', () => {
  describe('extractQueryIdAndSessionId', () => {
    describe('query ID extraction', () => {
      it('should extract queryId from innerData.queryName', () => {
        const entry: StreamEntry = {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            data: {
              queryName: 'test-query-1',
            },
          },
        };

        const result = extractQueryIdAndSessionId(entry);

        expect(result.queryId).toBe('test-query-1');
      });

      it('should extract queryId from innerData.queryId', () => {
        const entry: StreamEntry = {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            data: {
              queryId: 'query-id-123',
            },
          },
        };

        const result = extractQueryIdAndSessionId(entry);

        expect(result.queryId).toBe('query-id-123');
      });

      it('should extract queryId from outerData.query_id', () => {
        const entry: StreamEntry = {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            query_id: 'outer-query-456',
          },
        };

        const result = extractQueryIdAndSessionId(entry);

        expect(result.queryId).toBe('outer-query-456');
      });

      it('should prefer queryName over queryId', () => {
        const entry: StreamEntry = {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            data: {
              queryName: 'preferred-query',
              queryId: 'fallback-query',
            },
          },
        };

        const result = extractQueryIdAndSessionId(entry);

        expect(result.queryId).toBe('preferred-query');
      });
    });

    describe('session ID extraction from spans', () => {
      it('should extract sessionId from span attributes', () => {
        const entry: StreamEntry = {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            spans: [
              {
                attributes: [
                  { key: 'ark.session.id', value: 'session-abc-123' },
                  { key: 'other.attribute', value: 'other-value' },
                ],
              },
            ],
          },
        };

        const result = extractQueryIdAndSessionId(entry);

        expect(result.sessionId).toBe('session-abc-123');
      });

      it('should use first span with ark.session.id attribute', () => {
        const entry: StreamEntry = {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            spans: [
              {
                attributes: [{ key: 'ark.session.id', value: 'first-session' }],
              },
              {
                attributes: [{ key: 'ark.session.id', value: 'second-session' }],
              },
            ],
          },
        };

        const result = extractQueryIdAndSessionId(entry);

        expect(result.sessionId).toBe('first-session');
      });

      it('should handle outerData.attributes as a single span', () => {
        const entry: StreamEntry = {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            attributes: [{ key: 'ark.session.id', value: 'direct-session' }],
          },
        };

        const result = extractQueryIdAndSessionId(entry);

        expect(result.sessionId).toBe('direct-session');
      });
    });

    describe('session ID extraction from ark data', () => {
      it('should extract sessionId from innerData.sessionId', () => {
        const entry: StreamEntry = {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            data: {
              sessionId: 'inner-session-xyz',
            },
          },
        };

        const result = extractQueryIdAndSessionId(entry);

        expect(result.sessionId).toBe('inner-session-xyz');
      });

      it('should extract sessionId from outerData.ark.session', () => {
        const entry: StreamEntry = {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            ark: {
              session: 'outer-ark-session',
            },
          },
        };

        const result = extractQueryIdAndSessionId(entry);

        expect(result.sessionId).toBe('outer-ark-session');
      });

      it('should extract sessionId from chunk.ark.session', () => {
        const entry: StreamEntry = {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            data: {
              chunk: {
                ark: {
                  session: 'chunk-session',
                },
              },
            },
          },
        };

        const result = extractQueryIdAndSessionId(entry);

        expect(result.sessionId).toBe('chunk-session');
      });

      it('should extract sessionId from ark.completedQuery.spec.sessionId', () => {
        const entry: StreamEntry = {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            ark: {
              completedQuery: {
                spec: {
                  sessionId: 'completed-query-session',
                },
              },
            },
          },
        };

        const result = extractQueryIdAndSessionId(entry);

        expect(result.sessionId).toBe('completed-query-session');
      });
    });
  });

  describe('sortEntriesByTimestampAndSequence', () => {
    it('should sort entries by timestamp in ascending order', () => {
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T12:00:00.000Z',
          data: {},
        },
        {
          id: '2',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {},
        },
        {
          id: '3',
          timestamp: '2024-01-15T11:00:00.000Z',
          data: {},
        },
      ];

      const sorted = sortEntriesByTimestampAndSequence(entries);

      expect(sorted[0].id).toBe('2');
      expect(sorted[1].id).toBe('3');
      expect(sorted[2].id).toBe('1');
    });

    it('should use sequenceNumber as tiebreaker for same timestamp', () => {
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: { sequenceNumber: 3 },
        },
        {
          id: '2',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: { sequenceNumber: 1 },
        },
        {
          id: '3',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: { sequenceNumber: 2 },
        },
      ];

      const sorted = sortEntriesByTimestampAndSequence(entries);

      expect(sorted[0].id).toBe('2');
      expect(sorted[1].id).toBe('3');
      expect(sorted[2].id).toBe('1');
    });

    it('should treat missing sequenceNumber as 0', () => {
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: { sequenceNumber: 5 },
        },
        {
          id: '2',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {},
        },
        {
          id: '3',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: { sequenceNumber: 2 },
        },
      ];

      const sorted = sortEntriesByTimestampAndSequence(entries);

      expect(sorted[0].id).toBe('2');
      expect(sorted[1].id).toBe('3');
      expect(sorted[2].id).toBe('1');
    });

    it('should not mutate original array', () => {
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T12:00:00.000Z',
          data: {},
        },
        {
          id: '2',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {},
        },
      ];

      const originalFirstId = entries[0].id;
      sortEntriesByTimestampAndSequence(entries);

      expect(entries[0].id).toBe(originalFirstId);
    });
  });

  describe('groupEntriesBySession', () => {
    it('should group entries by session ID', () => {
      const queryToSessionMap: Record<string, string> = {};
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            data: {
              sessionId: 'session-1',
            },
          },
        },
        {
          id: '2',
          timestamp: '2024-01-15T10:01:00.000Z',
          data: {
            data: {
              sessionId: 'session-2',
            },
          },
        },
        {
          id: '3',
          timestamp: '2024-01-15T10:02:00.000Z',
          data: {
            data: {
              sessionId: 'session-1',
            },
          },
        },
      ];

      const grouped = groupEntriesBySession(entries, queryToSessionMap);

      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped['session-1']).toHaveLength(2);
      expect(grouped['session-2']).toHaveLength(1);
    });

    it('should populate queryToSessionMap when both queryId and sessionId are present', () => {
      const queryToSessionMap: Record<string, string> = {};
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            data: {
              queryId: 'query-123',
              sessionId: 'session-abc',
            },
          },
        },
      ];

      groupEntriesBySession(entries, queryToSessionMap);

      expect(queryToSessionMap['query-123']).toBe('session-abc');
    });

    it('should use queryToSessionMap to find sessionId when only queryId is present', () => {
      const queryToSessionMap: Record<string, string> = {
        'query-456': 'session-xyz',
      };
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            data: {
              queryId: 'query-456',
            },
          },
        },
      ];

      const grouped = groupEntriesBySession(entries, queryToSessionMap);

      expect(grouped['session-xyz']).toHaveLength(1);
      expect(grouped['session-xyz'][0].id).toBe('1');
    });

    it('should assign to unknown session when no sessionId is found', () => {
      const queryToSessionMap: Record<string, string> = {};
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            someOtherData: 'value',
          },
        },
      ];

      const grouped = groupEntriesBySession(entries, queryToSessionMap);

      expect(grouped['unknown']).toHaveLength(1);
      expect(grouped['unknown'][0].id).toBe('1');
    });

    it('should build up queryToSessionMap progressively', () => {
      const queryToSessionMap: Record<string, string> = {};
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            data: {
              queryId: 'query-1',
              sessionId: 'session-A',
            },
          },
        },
        {
          id: '2',
          timestamp: '2024-01-15T10:01:00.000Z',
          data: {
            data: {
              queryId: 'query-1',
            },
          },
        },
      ];

      const grouped = groupEntriesBySession(entries, queryToSessionMap);

      expect(grouped['session-A']).toHaveLength(2);
      expect(queryToSessionMap['query-1']).toBe('session-A');
    });

    it('should handle mixed entry types (events, chunks, traces)', () => {
      const queryToSessionMap: Record<string, string> = {};
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            spans: [
              {
                attributes: [{ key: 'ark.session.id', value: 'session-1' }],
              },
            ],
          },
        },
        {
          id: '2',
          timestamp: '2024-01-15T10:01:00.000Z',
          data: {
            data: {
              chunk: {
                ark: {
                  session: 'session-1',
                },
              },
            },
          },
        },
        {
          id: '3',
          timestamp: '2024-01-15T10:02:00.000Z',
          data: {
            data: {
              sessionId: 'session-1',
            },
          },
        },
      ];

      const grouped = groupEntriesBySession(entries, queryToSessionMap);

      expect(grouped['session-1']).toHaveLength(3);
    });
  });

  describe('getSessionDisplayNameFromEntries', () => {
    it('should return sessionId when entries are empty', () => {
      const result = getSessionDisplayNameFromEntries([], 'session-123');
      expect(result).toBe('session-123');
    });

    it('should return sessionId when no entry has input', () => {
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: { data: { sessionId: 'session-1' } },
        },
        {
          id: '2',
          timestamp: '2024-01-15T10:01:00.000Z',
          data: { someOtherField: 'value' },
        },
      ];
      const result = getSessionDisplayNameFromEntries(entries, 'session-123');
      expect(result).toBe('session-123');
    });

    it('should return input from first entry with data.input', () => {
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: { input: 'What is 2+2?' },
        },
        {
          id: '2',
          timestamp: '2024-01-15T10:01:00.000Z',
          data: { input: 'Another question' },
        },
      ];
      const result = getSessionDisplayNameFromEntries(entries, 'session-123');
      expect(result).toBe('What is 2+2?');
    });

    it('should return input from nested data.data.input', () => {
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: { data: { input: 'Nested user question' } },
        },
      ];
      const result = getSessionDisplayNameFromEntries(entries, 'session-123');
      expect(result).toBe('Nested user question');
    });

    it('should truncate long input to 48 characters with ellipsis', () => {
      const longInput =
        'This is a very long user input that exceeds the maximum display length limit';
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: { input: longInput },
        },
      ];
      const result = getSessionDisplayNameFromEntries(entries, 'session-123');
      expect(result).toHaveLength(48);
      expect(result.endsWith('...')).toBe(true);
      expect(result).toBe(longInput.slice(0, 45) + '...');
    });

    it('should not truncate input that is exactly 48 characters', () => {
      const exactInput = 'A'.repeat(48);
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: { input: exactInput },
        },
      ];
      const result = getSessionDisplayNameFromEntries(entries, 'session-123');
      expect(result).toBe(exactInput);
    });

    it('should skip entries without input and use the first one that has it', () => {
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: { data: { sessionId: 'session-1' } },
        },
        {
          id: '2',
          timestamp: '2024-01-15T10:01:00.000Z',
          data: { input: 'Found it!' },
        },
      ];
      const result = getSessionDisplayNameFromEntries(entries, 'session-123');
      expect(result).toBe('Found it!');
    });
  });

  describe('integration: full workflow', () => {
    it('should sort, group, and map entries correctly', () => {
      const queryToSessionMap: Record<string, string> = {};
      const entries: StreamEntry[] = [
        {
          id: '1',
          timestamp: '2024-01-15T10:02:00.000Z',
          data: {
            data: {
              queryId: 'query-A',
              sessionId: 'session-1',
            },
            sequenceNumber: 3,
          },
        },
        {
          id: '2',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            data: {
              queryId: 'query-B',
              sessionId: 'session-2',
            },
            sequenceNumber: 1,
          },
        },
        {
          id: '3',
          timestamp: '2024-01-15T10:03:00.000Z',
          data: {
            data: {
              queryId: 'query-A',
            },
            sequenceNumber: 4,
          },
        },
        {
          id: '4',
          timestamp: '2024-01-15T10:00:00.000Z',
          data: {
            data: {
              sessionId: 'session-1',
            },
            sequenceNumber: 5,
          },
        },
      ];

      const sorted = sortEntriesByTimestampAndSequence(entries);
      const grouped = groupEntriesBySession(sorted, queryToSessionMap);

      expect(sorted[0].id).toBe('2');
      expect(sorted[1].id).toBe('4');
      expect(sorted[2].id).toBe('1');
      expect(sorted[3].id).toBe('3');

      expect(queryToSessionMap).toEqual({
        'query-A': 'session-1',
        'query-B': 'session-2',
      });

      expect(grouped['session-1']).toHaveLength(3);
      expect(grouped['session-2']).toHaveLength(1);
      expect(grouped['session-1'].map(e => e.id)).toEqual(['4', '1', '3']);
    });
  });
});
