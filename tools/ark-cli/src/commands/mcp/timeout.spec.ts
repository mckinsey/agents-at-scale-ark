import {parseTimeoutDuration} from './timeout.js';

describe('parseTimeoutDuration', () => {
  it('accepts valid Go durations', () => {
    expect(parseTimeoutDuration('60s')).toBe(60_000);
    expect(parseTimeoutDuration('5m')).toBe(5 * 60_000);
    expect(parseTimeoutDuration('1h')).toBe(60 * 60_000);
    expect(parseTimeoutDuration('500ms')).toBe(500);
  });

  it('rejects garbage', () => {
    expect(() => parseTimeoutDuration('abc')).toThrow();
  });

  it('rejects negative durations', () => {
    expect(() => parseTimeoutDuration('-1m')).toThrow();
  });

  it('rejects zero durations', () => {
    expect(() => parseTimeoutDuration('0s')).toThrow();
    expect(() => parseTimeoutDuration('0m')).toThrow();
  });

  it('rejects missing unit', () => {
    expect(() => parseTimeoutDuration('60')).toThrow();
  });
});
