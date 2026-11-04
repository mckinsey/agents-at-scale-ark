import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRefreshAccessToken } from '@/hooks/useRefreshAccessToken';

const mockUpdate = vi.fn();
let intervalCallback: (() => Promise<void>) | undefined;

vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated', update: mockUpdate }),
}));

vi.mock('@/hooks/useConditionalInterval', () => ({
  useConditionalInterval: ({ callback }: { callback: () => Promise<void> }) => {
    intervalCallback = callback;
  },
}));

vi.mock('@/hooks/useWindowFocus', () => ({
  useWindowFocus: vi.fn(),
}));

const mockRedirectToSignIn = vi.fn();

vi.mock('@/lib/auth/signin', () => ({
  redirectToSignIn: () => mockRedirectToSignIn(),
}));

describe('useRefreshAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    intervalCallback = undefined;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function refresh() {
    renderHook(() => useRefreshAccessToken());
    if (!intervalCallback) throw new Error('interval callback not registered');
    await intervalCallback();
  }

  it('keeps the session when the refresh request fails', async () => {
    mockUpdate.mockResolvedValueOnce(null);

    await refresh();

    expect(mockUpdate).toHaveBeenCalledWith({ shouldRefreshToken: true });
    expect(mockRedirectToSignIn).not.toHaveBeenCalled();
  });

  it('tries again on the next tick after a failed refresh', async () => {
    mockUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce({ user: {} });

    renderHook(() => useRefreshAccessToken());
    await intervalCallback?.();
    await intervalCallback?.();

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockRedirectToSignIn).not.toHaveBeenCalled();
  });

  it('sends the user to sign in when the session reports an error', async () => {
    mockUpdate.mockResolvedValueOnce({ error: 'RefreshAccessTokenError' });

    await refresh();

    expect(mockRedirectToSignIn).toHaveBeenCalledTimes(1);
  });
});
