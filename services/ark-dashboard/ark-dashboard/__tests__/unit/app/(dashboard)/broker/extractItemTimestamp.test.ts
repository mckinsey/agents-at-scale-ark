import { describe, expect, it, vi } from 'vitest';

function extractItemTimestamp(item: unknown): string {
  if (!item) {
    return new Date().toISOString();
  }
  const typedItem = item as Record<string, unknown>;
  if (typedItem.timestamp) {
    return typedItem.timestamp as string;
  }
  let unixTimestamp = '';
  if (typedItem?.startTimeUnixNano) {
    unixTimestamp = typedItem.startTimeUnixNano as string;
  }
  const spans = typedItem?.spans as Array<Record<string, unknown>>;
  if (!unixTimestamp && spans && spans.length > 0) {
    unixTimestamp = spans[0].startTimeUnixNano as string;
  }
  if (unixTimestamp) {
    return new Date(parseInt(unixTimestamp.substring(0, 13))).toISOString();
  }

  return new Date().toISOString();
}

describe('extractItemTimestamp', () => {
  describe('when item has timestamp property', () => {
    it('should return the timestamp property directly', () => {
      const item = {
        timestamp: '2024-01-15T10:30:00.000Z',
        startTimeUnixNano: '1705318200000000000',
      };

      const result = extractItemTimestamp(item);

      expect(result).toBe('2024-01-15T10:30:00.000Z');
    });
  });

  describe('when item has startTimeUnixNano property', () => {
    it('should convert startTimeUnixNano to ISO string', () => {
      const item = {
        startTimeUnixNano: '1705318200000000000',
      };

      const result = extractItemTimestamp(item);

      expect(result).toBe('2024-01-15T11:30:00.000Z');
    });

    it('should handle startTimeUnixNano with millisecond precision', () => {
      const item = {
        startTimeUnixNano: '1705318200123000000',
      };

      const result = extractItemTimestamp(item);

      expect(result).toBe('2024-01-15T11:30:00.123Z');
    });
  });

  describe('when item has spans with startTimeUnixNano', () => {
    it('should extract startTimeUnixNano from first span', () => {
      const item = {
        spans: [
          {
            startTimeUnixNano: '1705318200000000000',
          },
        ],
      };

      const result = extractItemTimestamp(item);

      expect(result).toBe('2024-01-15T11:30:00.000Z');
    });

    it('should use first span even when multiple spans exist', () => {
      const item = {
        spans: [
          {
            startTimeUnixNano: '1705318200000000000',
          },
          {
            startTimeUnixNano: '1705318300000000000',
          },
        ],
      };

      const result = extractItemTimestamp(item);

      expect(result).toBe('2024-01-15T11:30:00.000Z');
    });

    it('should prefer direct startTimeUnixNano over spans', () => {
      const item = {
        startTimeUnixNano: '1705318200000000000',
        spans: [
          {
            startTimeUnixNano: '1705318300000000000',
          },
        ],
      };

      const result = extractItemTimestamp(item);

      expect(result).toBe('2024-01-15T11:30:00.000Z');
    });
  });

  describe('fallback behavior', () => {
    it('should return current timestamp when no timestamp data exists', () => {
      const mockDate = new Date('2024-01-15T12:00:00.000Z');
      vi.setSystemTime(mockDate);

      const item = {
        data: 'some other data',
      };

      const result = extractItemTimestamp(item);

      expect(result).toBe('2024-01-15T12:00:00.000Z');

      vi.useRealTimers();
    });

    it('should return current timestamp when item is empty object', () => {
      const mockDate = new Date('2024-01-15T12:00:00.000Z');
      vi.setSystemTime(mockDate);

      const item = {};

      const result = extractItemTimestamp(item);

      expect(result).toBe('2024-01-15T12:00:00.000Z');

      vi.useRealTimers();
    });

    it('should return current timestamp when spans array is empty', () => {
      const mockDate = new Date('2024-01-15T12:00:00.000Z');
      vi.setSystemTime(mockDate);

      const item = {
        spans: [],
      };

      const result = extractItemTimestamp(item);

      expect(result).toBe('2024-01-15T12:00:00.000Z');

      vi.useRealTimers();
    });

    it('should return current timestamp when item is null', () => {
      const mockDate = new Date('2024-01-15T12:00:00.000Z');
      vi.setSystemTime(mockDate);

      const item = null;

      const result = extractItemTimestamp(item);

      expect(result).toBe('2024-01-15T12:00:00.000Z');

      vi.useRealTimers();
    });
  });

  describe('edge cases', () => {
    it('should handle spans that exist but first span has no startTimeUnixNano', () => {
      const mockDate = new Date('2024-01-15T12:00:00.000Z');
      vi.setSystemTime(mockDate);

      const item = {
        spans: [
          {
            name: 'some-span',
          },
        ],
      };

      const result = extractItemTimestamp(item);

      expect(result).toBe('2024-01-15T12:00:00.000Z');

      vi.useRealTimers();
    });

    it('should handle undefined startTimeUnixNano values', () => {
      const mockDate = new Date('2024-01-15T12:00:00.000Z');
      vi.setSystemTime(mockDate);

      const item = {
        startTimeUnixNano: undefined,
        spans: [
          {
            startTimeUnixNano: undefined,
          },
        ],
      };

      const result = extractItemTimestamp(item);

      expect(result).toBe('2024-01-15T12:00:00.000Z');

      vi.useRealTimers();
    });

    it('should handle very short unixTimestamp strings', () => {
      const item = {
        startTimeUnixNano: '1234567890',
      };

      const result = extractItemTimestamp(item);

      expect(result).toBe('1970-01-15T06:56:07.890Z');
    });
  });
});
