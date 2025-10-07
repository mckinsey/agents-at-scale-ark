import {describe, it, expect} from '@jest/globals';
import {parseTimeoutToSeconds} from './timeout.js';

describe('parseTimeoutToSeconds', () => {
  it('should parse time units correctly', () => {
    expect(parseTimeoutToSeconds('30s')).toBe(30);
    expect(parseTimeoutToSeconds('2m')).toBe(120);
    expect(parseTimeoutToSeconds('1h')).toBe(3600);
    expect(parseTimeoutToSeconds('60')).toBe(60);
  });

  it('should throw error for invalid formats', () => {
    expect(() => parseTimeoutToSeconds('abc')).toThrow(
      'Invalid timeout format'
    );
    expect(() => parseTimeoutToSeconds('-5s')).toThrow(
      'Invalid timeout format'
    );
  });
});
