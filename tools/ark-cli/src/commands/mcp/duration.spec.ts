import {describe, it, expect} from 'vitest';
import {parseGoDuration} from './duration.js';

describe('parseGoDuration', () => {
  it('parses seconds', () => {
    expect(parseGoDuration('60s')).toBe(60_000);
  });

  it('parses minutes', () => {
    expect(parseGoDuration('5m')).toBe(300_000);
  });

  it('parses compound 1h30m', () => {
    expect(parseGoDuration('1h30m')).toBe(5_400_000);
  });

  it('parses milliseconds', () => {
    expect(parseGoDuration('500ms')).toBe(500);
  });

  it('parses microseconds (us)', () => {
    expect(parseGoDuration('2000us')).toBe(2);
  });

  it('parses microseconds (µs)', () => {
    expect(parseGoDuration('2000µs')).toBe(2);
  });

  it('parses hours', () => {
    expect(parseGoDuration('2h')).toBe(7_200_000);
  });

  it('parses fractional values', () => {
    expect(parseGoDuration('1.5s')).toBe(1500);
  });

  it('rejects negative durations', () => {
    expect(() => parseGoDuration('-5s')).toThrow(/positive Go-duration/);
  });

  it('rejects non-duration strings', () => {
    expect(() => parseGoDuration('abc')).toThrow(/Go-duration/);
  });

  it('rejects empty strings', () => {
    expect(() => parseGoDuration('')).toThrow(/Go-duration/);
  });

  it('rejects partial consumption', () => {
    expect(() => parseGoDuration('5sxyz')).toThrow(/Go-duration/);
  });

  it('rejects bare numbers without a unit', () => {
    expect(() => parseGoDuration('5')).toThrow(/Go-duration/);
  });
});
