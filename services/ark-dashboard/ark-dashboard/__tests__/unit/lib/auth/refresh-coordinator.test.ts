import type { JWT } from '@auth/core/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isAccessTokenExpiring,
  refreshAccessToken,
  resetRefreshCoordinator,
} from '@/lib/auth/refresh-coordinator';
import { TokenManager } from '@/lib/auth/token-manager';

vi.mock('@/lib/auth/token-manager', () => ({
  TokenManager: {
    getNewAccessToken: vi.fn(),
  },
}));

describe('refresh-coordinator', () => {
  const mockToken: JWT = {
    sub: 'user123',
    refresh_token: 'refresh-token-a',
    access_token: 'access-token-a',
    expires_at: 1_700_000_060,
    provider: 'oidc',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetRefreshCoordinator();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetRefreshCoordinator();
  });

  describe('isAccessTokenExpiring', () => {
    it('should be false while the access token has more than the skew left', () => {
      const nowMs = (mockToken.expires_at! - 31) * 1000;

      expect(isAccessTokenExpiring(mockToken, nowMs)).toBe(false);
    });

    it('should be true once the access token is inside the 30s skew', () => {
      const nowMs = (mockToken.expires_at! - 30) * 1000;

      expect(isAccessTokenExpiring(mockToken, nowMs)).toBe(true);
    });

    it('should be true once the access token has expired', () => {
      const nowMs = (mockToken.expires_at! + 60) * 1000;

      expect(isAccessTokenExpiring(mockToken, nowMs)).toBe(true);
    });

    it('should be false when expires_at is absent', () => {
      expect(isAccessTokenExpiring({ sub: 'user123' }, Date.now())).toBe(false);
    });
  });

  describe('refreshAccessToken', () => {
    it('should spend a single-use refresh token only once for concurrent callers', async () => {
      const refreshed: JWT = { ...mockToken, access_token: 'access-token-b' };
      vi.mocked(TokenManager.getNewAccessToken).mockResolvedValue(refreshed);

      const results = await Promise.all(
        Array.from({ length: 8 }, () => refreshAccessToken(mockToken)),
      );

      expect(TokenManager.getNewAccessToken).toHaveBeenCalledTimes(1);
      for (const result of results) {
        expect(result).toEqual(refreshed);
      }
    });

    it('should reuse the result for a later caller still holding the old token', async () => {
      const refreshed: JWT = { ...mockToken, access_token: 'access-token-b' };
      vi.mocked(TokenManager.getNewAccessToken).mockResolvedValue(refreshed);

      await refreshAccessToken(mockToken);
      const late = await refreshAccessToken(mockToken);

      expect(TokenManager.getNewAccessToken).toHaveBeenCalledTimes(1);
      expect(late).toEqual(refreshed);
    });

    it('should not cache a failure, so the next caller retries', async () => {
      const failure = new Error('refresh rejected');
      vi.mocked(TokenManager.getNewAccessToken).mockRejectedValueOnce(failure);
      const refreshed: JWT = { ...mockToken, access_token: 'access-token-b' };
      vi.mocked(TokenManager.getNewAccessToken).mockResolvedValueOnce(
        refreshed,
      );

      await expect(refreshAccessToken(mockToken)).rejects.toThrow(
        'refresh rejected',
      );
      await expect(refreshAccessToken(mockToken)).resolves.toEqual(refreshed);

      expect(TokenManager.getNewAccessToken).toHaveBeenCalledTimes(2);
    });

    it('should key coalescing on the refresh token, not the session', async () => {
      vi.mocked(TokenManager.getNewAccessToken).mockImplementation(
        (token: JWT) =>
          Promise.resolve({
            ...token,
            access_token: `new-${token.refresh_token}`,
          }),
      );

      const other: JWT = { ...mockToken, refresh_token: 'refresh-token-b' };
      const [first, second] = await Promise.all([
        refreshAccessToken(mockToken),
        refreshAccessToken(other),
      ]);

      expect(TokenManager.getNewAccessToken).toHaveBeenCalledTimes(2);
      expect(first.access_token).toBe('new-refresh-token-a');
      expect(second.access_token).toBe('new-refresh-token-b');
    });

    it('should pass through to the token manager when there is no refresh token', async () => {
      const noRefresh: JWT = { sub: 'user123' };
      vi.mocked(TokenManager.getNewAccessToken).mockRejectedValue(
        new Error('token refresh failed: missing_refresh_token'),
      );

      await expect(refreshAccessToken(noRefresh)).rejects.toThrow(
        'missing_refresh_token',
      );
      expect(TokenManager.getNewAccessToken).toHaveBeenCalledWith(noRefresh);
    });
  });
});
