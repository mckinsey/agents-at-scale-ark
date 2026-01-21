import { describe, expect, it } from 'vitest';

import { hashPrompt, hashPromptSync } from '@/lib/analytics/utils';

describe('hashPrompt', () => {
  it('should generate consistent hash for same input', async () => {
    const input = 'Hello, this is a test message';
    const hash1 = await hashPrompt(input);
    const hash2 = await hashPrompt(input);

    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different inputs', async () => {
    const hash1 = await hashPrompt('Message 1');
    const hash2 = await hashPrompt('Message 2');

    expect(hash1).not.toBe(hash2);
  });

  it('should return a hex string', async () => {
    const hash = await hashPrompt('test');

    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('should generate 64 character hash (SHA-256)', async () => {
    const hash = await hashPrompt('test');

    expect(hash).toHaveLength(64);
  });
});

describe('hashPromptSync', () => {
  it('should generate consistent hash for same input', () => {
    const input = 'Hello, this is a test message';
    const hash1 = hashPromptSync(input);
    const hash2 = hashPromptSync(input);

    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different inputs', () => {
    const hash1 = hashPromptSync('Message 1');
    const hash2 = hashPromptSync('Message 2');

    expect(hash1).not.toBe(hash2);
  });

  it('should return a hex string', () => {
    const hash = hashPromptSync('test');

    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('should handle empty string', () => {
    const hash = hashPromptSync('');

    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
  });

  it('should handle special characters', () => {
    const hash = hashPromptSync('Hello! @#$%^&*() 你好 🎉');

    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
  });
});

