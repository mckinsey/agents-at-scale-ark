import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TokenManager } from '@/lib/auth/token-manager';
import { openidConfigManager } from '@/lib/auth/openid-config-manager';
import type { JWT } from '@auth/core/jwt';

// Mock the openid config manager
vi.mock('@/lib/auth/openid-config-manager', () => ({
  openidConfigManager: {
    getConfig: vi.fn()
  }
}));

// Mock environment variables
const mockEnv = {
  OIDC_CLIENT_ID: 'test-client-id',
  OIDC_CLIENT_SECRET: 'test-client-secret'
};

Object.defineProperty(process, 'env', {
  value: mockEnv,
  writable: true
});

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TokenManager', () => {
  const mockToken: JWT = {
    sub: 'user123',
    refresh_token: 'mock-refresh-token',
    access_token: 'old-access-token',
    expires_at: 1234567890,
    provider: 'oidc',
    id_token: 'mock-id-token'
  };

  const mockOpenidConfig = {
    token_endpoint: 'https://example.com/token',
    end_session_endpoint: 'https://example.com/logout'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(openidConfigManager.getConfig).mockResolvedValue(mockOpenidConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getNewAccessToken', () => {
    it('should successfully refresh access token', async () => {
      const mockTokenResponse = {
        access_token: 'new-access-token',
        expires_in: 3600,
        refresh_token: 'new-refresh-token'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse)
      });

      // Mock Date.now to have predictable expires_at calculation
      const mockNow = 1700000000000; // Fixed timestamp
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = await TokenManager.getNewAccessToken(mockToken);

      expect(openidConfigManager.getConfig).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledWith('https://example.com/token', {
        method: 'POST',
        body: expect.any(URLSearchParams)
      });

      // Verify the request body
      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = fetchCall[1]?.body as URLSearchParams;
      expect(body.get('client_id')).toBe('test-client-id');
      expect(body.get('client_secret')).toBe('test-client-secret');
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('mock-refresh-token');

      expect(result).toEqual({
        ...mockToken,
        access_token: 'new-access-token',
        expires_at: Math.floor(mockNow / 1000 + 3600),
        refresh_token: 'new-refresh-token'
      });
    });

    it('should preserve old refresh token when new one is not provided', async () => {
      const mockTokenResponse = {
        access_token: 'new-access-token',
        expires_in: 3600
        // No refresh_token in response
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse)
      });

      const mockNow = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = await TokenManager.getNewAccessToken(mockToken);

      expect(result.refresh_token).toBe('mock-refresh-token'); // Original refresh token preserved
      expect(result.access_token).toBe('new-access-token');
    });

    it('should throw error when OIDC config has no token endpoint', async () => {
      vi.mocked(openidConfigManager.getConfig).mockResolvedValue({
        end_session_endpoint: 'https://example.com/logout'
        // No token_endpoint
      });

      await expect(TokenManager.getNewAccessToken(mockToken)).rejects.toThrow(
        'OIDC config does not provide a token endpoint'
      );
    });

    it('should throw error when token refresh request fails', async () => {
      const mockErrorResponse = {
        error: 'invalid_grant',
        error_description: 'The refresh token is invalid'
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve(mockErrorResponse)
      });

      await expect(TokenManager.getNewAccessToken(mockToken)).rejects.toEqual(mockErrorResponse);
    });

    it('should handle network errors during token refresh', async () => {
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValueOnce(networkError);

      await expect(TokenManager.getNewAccessToken(mockToken)).rejects.toThrow('Network error');
    });

    it('should handle JSON parsing errors in token response', async () => {
      const jsonError = new Error('Invalid JSON');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(jsonError)
      });

      await expect(TokenManager.getNewAccessToken(mockToken)).rejects.toThrow('Invalid JSON');
    });

    it('should calculate correct expires_at timestamp', async () => {
      const mockTokenResponse = {
        access_token: 'new-access-token',
        expires_in: 7200 // 2 hours
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse)
      });

      const mockNow = 1700000000000; // Fixed timestamp
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = await TokenManager.getNewAccessToken(mockToken);

      const expectedExpiresAt = Math.floor(mockNow / 1000 + 7200);
      expect(result.expires_at).toBe(expectedExpiresAt);
    });

    it('should preserve all other token properties', async () => {
      const extendedToken: JWT = {
        ...mockToken,
        iat: 1234567890,
        exp: 1234571490,
        name: 'John Doe',
        email: 'john@example.com'
      };

      const mockTokenResponse = {
        access_token: 'new-access-token',
        expires_in: 3600
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse)
      });

      const mockNow = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const result = await TokenManager.getNewAccessToken(extendedToken);

      expect(result).toEqual({
        ...extendedToken,
        access_token: 'new-access-token',
        expires_at: Math.floor(mockNow / 1000 + 3600),
        refresh_token: 'mock-refresh-token'
      });
    });

    it('should handle missing environment variables', async () => {
      const originalEnv = process.env;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      process.env = {} as any;

      const mockTokenResponse = {
        access_token: 'new-access-token',
        expires_in: 3600
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTokenResponse)
      });

      await TokenManager.getNewAccessToken(mockToken);

      // Verify the request was made with undefined values which URLSearchParams converts to 'undefined'
      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = fetchCall[1]?.body as URLSearchParams;
      expect(body.get('client_id')).toBe('undefined');
      expect(body.get('client_secret')).toBe('undefined');

      // Restore environment
      process.env = originalEnv;
    });
  });
});
