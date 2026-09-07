import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import { mcpServersService } from '@/lib/services/mcp-servers';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

describe('mcpServersService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('maps list items to include id without a per-item detail fetch', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        items: [
          { name: 'mcp1', available: 'True' },
          { name: 'mcp2', available: 'False' },
        ],
      });

      const result = await mcpServersService.getAll('team-a');

      expect(apiClient.get).toHaveBeenCalledTimes(1);
      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/mcp-servers', {
        params: { limit: 100, namespace: 'team-a' },
      });
      expect(result).toEqual([
        { name: 'mcp1', available: 'True', id: 'mcp1' },
        { name: 'mcp2', available: 'False', id: 'mcp2' },
      ]);
    });
  });

  describe('startAuth', () => {
    it('posts redirect_on_complete: true with the namespace', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        auth_id: 'aid',
        authorization_url: 'https://idp/authorize',
        flow_expires_at: '2030-01-01T00:00:00Z',
      });

      await mcpServersService.startAuth('notion', { namespace: 'team-a' });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/mcp-servers/notion/auth/start',
        { redirect_on_complete: true },
        { params: { namespace: 'team-a' } },
      );
    });

    it('adds force: true when requested', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        auth_id: 'aid',
        authorization_url: 'https://idp/authorize',
        flow_expires_at: '2030-01-01T00:00:00Z',
      });

      await mcpServersService.startAuth('notion', {
        namespace: 'team-a',
        force: true,
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/mcp-servers/notion/auth/start',
        { redirect_on_complete: true, force: true },
        { params: { namespace: 'team-a' } },
      );
    });
  });

  describe('logoutAuth', () => {
    it('posts the default (clear) body with the namespace', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        noop: false,
        deleted: false,
        cleared_keys: ['access_token'],
      });

      await mcpServersService.logoutAuth('notion', { namespace: 'team-a' });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/mcp-servers/notion/auth/logout',
        {},
        { params: { namespace: 'team-a' } },
      );
    });
  });

  describe('getAuthStatus', () => {
    it('gets status with auth_id and namespace params', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ state: 'authorized' });

      await mcpServersService.getAuthStatus('notion', {
        authId: 'aid',
        namespace: 'team-a',
      });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/v1/mcp-servers/notion/auth/status',
        { params: { auth_id: 'aid', namespace: 'team-a' } },
      );
    });
  });
});
