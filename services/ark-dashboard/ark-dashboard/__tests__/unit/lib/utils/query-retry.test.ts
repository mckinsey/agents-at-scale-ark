import { describe, expect, it } from 'vitest';

import { APIError } from '@/lib/api/client';
import {
  createRetryQueryHandler,
  retryQueryHandler,
} from '@/lib/utils/query-retry';

describe('createRetryQueryHandler', () => {
  const retryOnce = createRetryQueryHandler(1);

  it.each([400, 401, 403, 404, 499])('should not retry a %i', status => {
    expect(retryOnce(0, new APIError('Client error', status))).toBe(false);
  });

  it('should retry a server error up to the limit', () => {
    const error = new APIError('Internal Server Error', 500);

    expect(retryOnce(0, error)).toBe(true);
    expect(retryOnce(1, error)).toBe(false);
  });

  it('should retry a network error up to the limit', () => {
    const error = new APIError('Failed to fetch');

    expect(retryOnce(0, error)).toBe(true);
    expect(retryOnce(1, error)).toBe(false);
  });

  it('should retry a non-API error up to the limit', () => {
    const error = new Error('Unexpected');

    expect(retryOnce(0, error)).toBe(true);
    expect(retryOnce(1, error)).toBe(false);
  });
});

describe('retryQueryHandler', () => {
  it('should retry a server error up to three times', () => {
    const error = new APIError('Internal Server Error', 500);

    expect(retryQueryHandler(2, error)).toBe(true);
    expect(retryQueryHandler(3, error)).toBe(false);
  });

  it('should not retry a client error', () => {
    expect(retryQueryHandler(0, new APIError('Not Found', 404))).toBe(false);
  });
});
