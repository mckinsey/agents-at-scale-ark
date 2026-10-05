import { describe, expect, it } from 'vitest';

import { APIError } from '@/lib/api/client';
import { createResourceErrorMessage } from '@/lib/services/resource-error-message';

describe('createResourceErrorMessage', () => {
  it('names the collision on 409', () => {
    const error = new APIError('Conflict', 409);
    expect(
      createResourceErrorMessage(error, 'Configuration', 'github-mcp-url'),
    ).toBe('A Configuration with the name "github-mcp-url" already exists.');
  });

  it('names the missing permission on 403', () => {
    const error = new APIError('Forbidden', 403);
    expect(createResourceErrorMessage(error, 'Secret', 'github-pat')).toBe(
      'You do not have permission to create a Secret in this namespace.',
    );
  });

  it('passes through other API error messages', () => {
    const error = new APIError('upstream exploded', 500);
    expect(createResourceErrorMessage(error, 'Secret', 'github-pat')).toBe(
      'upstream exploded',
    );
  });

  it('falls back for non-Error values', () => {
    expect(createResourceErrorMessage('nope', 'Secret', 'github-pat')).toBe(
      'An unexpected error occurred',
    );
  });
});
