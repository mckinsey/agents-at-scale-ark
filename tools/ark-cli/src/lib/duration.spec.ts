import {parseDuration} from './duration.js';

describe('parseDuration', () => {
  it('should parse durations correctly', () => {
    expect(parseDuration('100ms')).toBe(100);
    expect(parseDuration('30s')).toBe(30000);
    expect(parseDuration('5m')).toBe(300000);
    expect(parseDuration('1h')).toBe(3600000);
  });

  it('should throw on invalid format', () => {
    expect(() => parseDuration('invalid')).toThrow('Invalid duration format');
    expect(() => parseDuration('10')).toThrow('Invalid duration format');
  });
});
