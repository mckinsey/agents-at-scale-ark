import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { openidConfigManager } from '@/lib/auth/openid-config-manager';

// Mock the constants
vi.mock('@/lib/constants/auth', () => ({
  OIDC_CONFIG_URL: 'https://example.com/.well-known/openid-configuration'
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OpenidConfigManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the manager's internal state by accessing private properties
    // Note: This is a workaround since we can't easily reset the singleton
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (openidConfigManager as any).config = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (openidConfigManager as any).fetchPromise = null;
    
    // Reset fetch mock
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getConfig', () => {
    const mockConfig = {
      token_endpoint: 'https://example.com/token',
      end_session_endpoint: 'https://example.com/logout'
    };

    it('should handle multiple concurrent calls and return consistent results', async () => {
      // Use mockResolvedValue to handle multiple potential calls
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockConfig)
      });

      // Make multiple concurrent calls
      const promises = [
        openidConfigManager.getConfig(),
        openidConfigManager.getConfig(),
        openidConfigManager.getConfig()
      ];

      const results = await Promise.all(promises);

      // Verify that all calls return the same result
      expect(fetch).toHaveBeenCalled();
      results.forEach(result => {
        expect(result).toEqual(mockConfig);
      });
      
      // All results should be identical
      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);
    });

    it('should fetch and return OIDC configuration on first call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig)
      });

      const config = await openidConfigManager.getConfig();

      expect(fetch).toHaveBeenCalledWith('https://example.com/.well-known/openid-configuration');
      expect(config).toEqual(mockConfig);
    });

    it('should return cached config on subsequent calls', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig)
      });

      // First call
      await openidConfigManager.getConfig();
      
      // Second call
      const config = await openidConfigManager.getConfig();

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(config).toEqual(mockConfig);
    });

    it('should throw error when fetch fails', async () => {
      const mockError = new Error('Network error');
      mockFetch.mockRejectedValueOnce(mockError);

      await expect(openidConfigManager.getConfig()).rejects.toThrow('Network error');
      expect(fetch).toHaveBeenCalledWith('https://example.com/.well-known/openid-configuration');
    });

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(openidConfigManager.getConfig()).rejects.toThrow(
        'Failed to fetch OIDC well-known config: 404 Not Found'
      );
    });

    it('should handle JSON parsing errors', async () => {
      const jsonError = new Error('Invalid JSON');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(jsonError)
      });

      await expect(openidConfigManager.getConfig()).rejects.toThrow('Invalid JSON');
    });

    it('should reset fetchPromise after successful fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockConfig)
      });

      await openidConfigManager.getConfig();

      // Verify fetchPromise is reset to null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((openidConfigManager as any).fetchPromise).toBeNull();
    });

    it('should reset fetchPromise after failed fetch', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(openidConfigManager.getConfig()).rejects.toThrow();
      // Verify fetchPromise is reset to null even after error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((openidConfigManager as any).fetchPromise).toBeNull();
    });

    it('should handle empty config response', async () => {
      const emptyConfig = {};
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(emptyConfig)
      });

      const config = await openidConfigManager.getConfig();
      expect(config).toEqual(emptyConfig);
    });

    it('should handle partial config response', async () => {
      const partialConfig = {
        token_endpoint: 'https://example.com/token'
        // missing end_session_endpoint
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(partialConfig)
      });

      const config = await openidConfigManager.getConfig();
      expect(config).toEqual(partialConfig);
      expect(config.token_endpoint).toBe('https://example.com/token');
      expect(config.end_session_endpoint).toBeUndefined();
    });
  });
});
