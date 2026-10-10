import { describe, expect, it } from 'vitest';

import { GET } from '@/app/healthz/route';

describe('app/healthz/route', () => {
  it('returns 200 with a JSON ok body', async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
