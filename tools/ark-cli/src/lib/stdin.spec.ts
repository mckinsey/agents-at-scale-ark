import {describe, it, expect, beforeEach, afterEach, jest} from '@jest/globals';
import {readStdin} from './stdin.js';
import {Readable} from 'stream';

describe('readStdin', () => {
  let originalStdin: typeof process.stdin;
  let mockStdin: Readable;

  beforeEach(() => {
    originalStdin = process.stdin;
    mockStdin = new Readable({
      read() {},
    });
    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });
    jest.clearAllMocks();
  });

  it('should return empty string when stdin is TTY', async () => {
    (mockStdin as any).isTTY = true;

    const result = await readStdin();

    expect(result).toBe('');
  });

  it('should read single chunk from stdin', async () => {
    (mockStdin as any).isTTY = false;

    const promise = readStdin();

    mockStdin.push('test-query');
    mockStdin.push(null);

    const result = await promise;

    expect(result).toBe('test-query');
  });

  it('should read multiple chunks from stdin', async () => {
    (mockStdin as any).isTTY = false;

    const promise = readStdin();

    mockStdin.push('test-');
    mockStdin.push('query-');
    mockStdin.push('name');
    mockStdin.push(null);

    const result = await promise;

    expect(result).toBe('test-query-name');
  });

  it('should trim whitespace from stdin input', async () => {
    (mockStdin as any).isTTY = false;

    const promise = readStdin();

    mockStdin.push('  test-query  \n');
    mockStdin.push(null);

    const result = await promise;

    expect(result).toBe('test-query');
  });

  it('should handle empty stdin input', async () => {
    (mockStdin as any).isTTY = false;

    const promise = readStdin();

    mockStdin.push(null);

    const result = await promise;

    expect(result).toBe('');
  });

  it('should handle stdin with only whitespace', async () => {
    (mockStdin as any).isTTY = false;

    const promise = readStdin();

    mockStdin.push('   \n\n  ');
    mockStdin.push(null);

    const result = await promise;

    expect(result).toBe('');
  });

  it('should handle multiline input', async () => {
    (mockStdin as any).isTTY = false;

    const promise = readStdin();

    mockStdin.push('line1\n');
    mockStdin.push('line2\n');
    mockStdin.push('line3');
    mockStdin.push(null);

    const result = await promise;

    expect(result).toBe('line1\nline2\nline3');
  });
});
