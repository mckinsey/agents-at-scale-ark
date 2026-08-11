import { describe, expect, it } from 'vitest';

import {
  extractQueryIdAndSessionId,
  getAttributeStringValue,
  type StreamEntry,
} from './session-utils';

describe('getAttributeStringValue', () => {
  it('returns plain string values unchanged', () => {
    expect(getAttributeStringValue('session-123')).toBe('session-123');
  });

  it('extracts stringValue from OTLP AnyValue', () => {
    expect(getAttributeStringValue({ stringValue: 'session-123' })).toBe(
      'session-123',
    );
  });

  it('extracts intValue (number) from OTLP AnyValue', () => {
    expect(getAttributeStringValue({ intValue: 42 })).toBe('42');
  });

  it('extracts intValue (string, OTLP JSON int64 encoding) from OTLP AnyValue', () => {
    expect(getAttributeStringValue({ intValue: '9007199254740993' })).toBe(
      '9007199254740993',
    );
  });

  it('extracts boolValue from OTLP AnyValue', () => {
    expect(getAttributeStringValue({ boolValue: true })).toBe('true');
    expect(getAttributeStringValue({ boolValue: false })).toBe('false');
  });

  it('extracts doubleValue from OTLP AnyValue', () => {
    expect(getAttributeStringValue({ doubleValue: 3.14 })).toBe('3.14');
  });

  it('returns undefined for null, undefined, and unsupported shapes', () => {
    expect(getAttributeStringValue(null)).toBeUndefined();
    expect(getAttributeStringValue(undefined)).toBeUndefined();
    expect(getAttributeStringValue({})).toBeUndefined();
    expect(getAttributeStringValue({ arrayValue: { values: [] } })).toBeUndefined();
    expect(getAttributeStringValue(42)).toBeUndefined();
  });
});

describe('extractQueryIdAndSessionId', () => {
  const traceEntry = (
    sessionValue: unknown,
    queryValue: unknown = 'q-1',
  ): StreamEntry => ({
    id: 'e1',
    timestamp: '2026-06-10T00:00:00Z',
    data: {
      spans: [
        {
          attributes: [
            { key: 'query.name', value: queryValue },
            { key: 'ark.session.id', value: sessionValue },
          ],
        },
      ],
    },
  });

  it('returns a string sessionId when attribute value is OTLP-wrapped', () => {
    const result = extractQueryIdAndSessionId(
      traceEntry({ stringValue: 'sess-abc' }, { stringValue: 'q-name' }),
    );
    expect(result.sessionId).toBe('sess-abc');
    expect(result.queryId).toBe('q-name');
  });

  it('returns a string sessionId when attribute value is a bare string', () => {
    const result = extractQueryIdAndSessionId(traceEntry('sess-bare', 'q-bare'));
    expect(result.sessionId).toBe('sess-bare');
    expect(result.queryId).toBe('q-bare');
  });

  it('skips empty OTLP values and falls back through other paths', () => {
    const entry: StreamEntry = {
      id: 'e1',
      timestamp: '2026-06-10T00:00:00Z',
      data: {
        spans: [{ attributes: [{ key: 'ark.session.id', value: {} }] }],
        data: { sessionId: 'fallback-sess' },
      },
    };
    expect(extractQueryIdAndSessionId(entry).sessionId).toBe('fallback-sess');
  });
});
