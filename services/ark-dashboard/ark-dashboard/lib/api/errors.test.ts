import { describe, expect, it } from 'vitest';

import { APIError, isNotFoundError } from './errors';

describe('isNotFoundError', () => {
  it('is true for an API 404', () => {
    expect(isNotFoundError(new APIError('Not found', 404))).toBe(true);
  });

  it('is false for other API errors', () => {
    expect(isNotFoundError(new APIError('Server error', 500))).toBe(false);
    expect(isNotFoundError(new APIError('Network error'))).toBe(false);
  });

  it('is false for errors that are not API errors', () => {
    expect(isNotFoundError(new Error('Not found'))).toBe(false);
    expect(isNotFoundError({ status: 404 })).toBe(false);
  });
});
