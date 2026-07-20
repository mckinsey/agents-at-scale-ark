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

describe('mcpServersService auth methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
