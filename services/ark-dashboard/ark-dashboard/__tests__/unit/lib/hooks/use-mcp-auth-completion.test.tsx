import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMcpAuthCompletion } from '@/lib/hooks/use-mcp-auth-completion';
import type { MCPServer } from '@/lib/services/mcp-servers';

const h = vi.hoisted(() => ({
  params: new URLSearchParams(),
  getAuthStatus: vi.fn(),
  invalidateQueries: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => h.params,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: h.invalidateQueries }),
}));

vi.mock('@/lib/services/mcp-servers', () => ({
  mcpServersService: { getAuthStatus: h.getAuthStatus },
}));

vi.mock('@/lib/services/mcp-servers-hooks', () => ({
  GET_ALL_MCP_SERVERS_QUERY_KEY: 'get-all-mcp-servers',
}));

vi.mock('sonner', () => ({ toast: h.toast }));

function setUrl(query: string) {
  h.params = new URLSearchParams(query);
  window.history.replaceState(null, '', `http://localhost:3000/mcp?${query}`);
}

const renderCompletion = (servers?: MCPServer[]) =>
  renderHook(() => useMcpAuthCompletion({ servers }));

describe('useMcpAuthCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.params = new URLSearchParams();
    window.history.replaceState(null, '', 'http://localhost:3000/mcp');
  });

  it('does nothing without auth params', () => {
    renderCompletion();
    expect(h.getAuthStatus).not.toHaveBeenCalled();
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it('shows the expired toast for auth_error=expired without polling', () => {
    setUrl('auth_error=expired');
    renderCompletion();
    expect(h.toast.error).toHaveBeenCalledWith(
      'Authentication flow expired',
      expect.any(Object),
    );
    expect(h.getAuthStatus).not.toHaveBeenCalled();
  });

  it('shows the description for a generic auth_error without polling', () => {
    setUrl('authorized=notion&auth_error=access_denied&auth_error_desc=User%20declined');
    renderCompletion();
    expect(h.toast.error).toHaveBeenCalledWith('Authentication Failed', {
      description: 'User declined',
    });
    expect(h.getAuthStatus).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain('auth_error');
  });

  it('polls to authorized and invalidates the query', async () => {
    setUrl('authorized=notion&auth_id=aid&namespace=team-a');
    h.getAuthStatus.mockResolvedValue({ state: 'authorized' });
    renderCompletion();
    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
    expect(h.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['get-all-mcp-servers'],
    });
    await waitFor(() => {
      expect(window.location.search).not.toContain('authorized');
      expect(window.location.search).not.toContain('auth_id');
    });
    expect(window.location.search).toContain('namespace=team-a');
  });

  it('shows the status message when the flow failed', async () => {
    setUrl('authorized=notion&auth_id=aid&namespace=team-a');
    h.getAuthStatus.mockResolvedValue({ state: 'failed', message: 'token denied' });
    renderCompletion();
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith('Authentication Failed', {
        description: 'token denied',
      }),
    );
  });

  it('shows the expired toast when the status is expired', async () => {
    setUrl('authorized=notion&auth_id=aid&namespace=team-a');
    h.getAuthStatus.mockResolvedValue({ state: 'expired' });
    renderCompletion();
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        'Authentication flow expired',
        expect.any(Object),
      ),
    );
  });

  it('suppresses the expired toast when the server is already Authorized', async () => {
    setUrl('authorized=notion&auth_id=aid&namespace=team-a');
    h.getAuthStatus.mockResolvedValue({ state: 'expired' });
    const servers = [
      {
        id: 'notion',
        name: 'notion',
        namespace: 'team-a',
        authorization: { state: 'Authorized' },
      } as MCPServer,
    ];
    renderCompletion(servers);
    await waitFor(() =>
      expect(window.location.search).not.toContain('authorized'),
    );
    expect(h.toast.error).not.toHaveBeenCalled();
  });
});
