import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  parsePage,
  parsePageSize,
} from '@/lib/utils/pagination';

describe('parsePage', () => {
  it('returns 1 when value is null', () => {
    expect(parsePage(null)).toBe(1);
  });

  it('returns 1 when value is empty string', () => {
    expect(parsePage('')).toBe(1);
  });

  it('returns 1 when value is not a number', () => {
    expect(parsePage('abc')).toBe(1);
  });

  it('returns 1 when value is zero', () => {
    expect(parsePage('0')).toBe(1);
  });

  it('returns 1 when value is negative', () => {
    expect(parsePage('-5')).toBe(1);
  });

  it('returns the parsed number for positive integers', () => {
    expect(parsePage('3')).toBe(3);
    expect(parsePage('100')).toBe(100);
  });

  it('floors fractional input via parseInt', () => {
    expect(parsePage('2.9')).toBe(2);
  });
});

describe('parsePageSize', () => {
  it('returns DEFAULT_PAGE_SIZE when value is null', () => {
    expect(parsePageSize(null)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('returns DEFAULT_PAGE_SIZE when value is not a number', () => {
    expect(parsePageSize('abc')).toBe(DEFAULT_PAGE_SIZE);
  });

  it('returns DEFAULT_PAGE_SIZE when value is zero', () => {
    expect(parsePageSize('0')).toBe(DEFAULT_PAGE_SIZE);
  });

  it('returns DEFAULT_PAGE_SIZE when value is negative', () => {
    expect(parsePageSize('-5')).toBe(DEFAULT_PAGE_SIZE);
  });

  it('returns the parsed value for values within range', () => {
    expect(parsePageSize('10')).toBe(10);
    expect(parsePageSize('15')).toBe(15);
    expect(parsePageSize('50')).toBe(50);
  });

  it('clamps values above MAX_PAGE_SIZE', () => {
    expect(parsePageSize('500')).toBe(MAX_PAGE_SIZE);
    expect(parsePageSize('9999')).toBe(MAX_PAGE_SIZE);
  });

  it('allows exactly MAX_PAGE_SIZE', () => {
    expect(parsePageSize('100')).toBe(100);
  });

  it('has DEFAULT_PAGE_SIZE = 10 and MAX_PAGE_SIZE = 100', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(10);
    expect(MAX_PAGE_SIZE).toBe(100);
  });
});
