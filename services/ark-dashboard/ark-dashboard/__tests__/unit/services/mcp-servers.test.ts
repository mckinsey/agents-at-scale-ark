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

const post = apiClient.post as ReturnType<typeof vi.fn>;
const get = apiClient.get as ReturnType<typeof vi.fn>;

describe('mcpServersService auth methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('startAuth sends redirect_on_complete and namespace', async () => {
    post.mockResolvedValue({ auth_id: 'a', authorization_url: 'u' });
    await mcpServersService.startAuth('notion', { namespace: 'team-a' });
    expect(post).toHaveBeenCalledWith(
      '/api/v1/mcp-servers/notion/auth/start',
      { redirect_on_complete: true },
      { params: { namespace: 'team-a' } },
    );
  });

  it('startAuth adds force when set', async () => {
    post.mockResolvedValue({ auth_id: 'a', authorization_url: 'u' });
    await mcpServersService.startAuth('notion', {
      namespace: 'team-a',
      force: true,
    });
    expect(post).toHaveBeenCalledWith(
      '/api/v1/mcp-servers/notion/auth/start',
      { redirect_on_complete: true, force: true },
      { params: { namespace: 'team-a' } },
    );
  });

  it('logoutAuth posts default clear with namespace', async () => {
    post.mockResolvedValue({});
    await mcpServersService.logoutAuth('notion', { namespace: 'team-a' });
    expect(post).toHaveBeenCalledWith(
      '/api/v1/mcp-servers/notion/auth/logout',
      {},
      { params: { namespace: 'team-a' } },
    );
  });

  it('getAuthStatus passes auth_id and namespace', async () => {
    get.mockResolvedValue({ state: 'pending' });
    await mcpServersService.getAuthStatus('notion', {
      namespace: 'team-a',
      authId: 'abc',
    });
    expect(get).toHaveBeenCalledWith(
      '/api/v1/mcp-servers/notion/auth/status',
      { params: { namespace: 'team-a', auth_id: 'abc' } },
    );
  });
});
