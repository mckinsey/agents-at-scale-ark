import {parseDuration} from './duration.js';

describe('parseDuration', () => {
  it('should parse single-unit durations correctly', () => {
    expect(parseDuration('100ms')).toBe(100);
    expect(parseDuration('30s')).toBe(30000);
    expect(parseDuration('5m')).toBe(300000);
    expect(parseDuration('1h')).toBe(3600000);
  });

  it('should parse compound Go-style durations', () => {
    // The controller writes metav1.Duration output like "5m0s" / "1h30m0s".
    expect(parseDuration('5m0s')).toBe(300000);
    expect(parseDuration('1h30m')).toBe(5400000);
    expect(parseDuration('1h30m0s')).toBe(5400000);
    expect(parseDuration('90m')).toBe(5400000);
  });

  it('should throw on invalid format', () => {
    expect(() => parseDuration('invalid')).toThrow('Invalid duration format');
    expect(() => parseDuration('10')).toThrow('Invalid duration format');
  });

  it('should throw on empty, whitespace, and malformed inputs', () => {
    expect(() => parseDuration('')).toThrow('Invalid duration format');
    expect(() => parseDuration('  ')).toThrow('Invalid duration format');
    expect(() => parseDuration('5m ')).toThrow('Invalid duration format');
    expect(() => parseDuration('10x')).toThrow('Invalid duration format');
    expect(() => parseDuration('ms')).toThrow('Invalid duration format');
    expect(() => parseDuration('5mins')).toThrow('Invalid duration format');
  });
});
