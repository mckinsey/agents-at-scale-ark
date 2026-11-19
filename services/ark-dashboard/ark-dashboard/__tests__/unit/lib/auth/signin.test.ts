import { afterEach, describe, expect, it, vi } from 'vitest';

import { redirectToSignIn } from '@/lib/auth/signin';

describe('redirectToSignIn', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('replaces the location with the sign-in route under the base path', () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { replace });
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/tenant-a');

    redirectToSignIn();

    expect(replace).toHaveBeenCalledWith('/tenant-a/api/auth/signin');
  });
});
