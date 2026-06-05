import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import McpPage from '@/app/(dashboard)/mcp/page';
import { toast } from 'sonner';
import { mcpServersService } from '@/lib/services/mcp-servers';

let mockParams: Record<string, string>;

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) =>
      key in mockParams ? mockParams[key] : null,
    toString: () => new URLSearchParams(mockParams).toString(),
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

vi.mock('@/components/sections/mcp-servers-section', () => ({
  McpServersSection: () => <div data-testid="mcp-section" />,
}));

vi.mock('@/lib/services/mcp-servers-hooks', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/services/mcp-servers-hooks')
  >('@/lib/services/mcp-servers-hooks');
  return {
    ...actual,
    useGetAllMcpServers: vi.fn(() => ({ data: [] })),
  };
});

vi.mock('@/lib/services/mcp-servers', () => ({
  mcpServersService: { getAuthStatus: vi.fn() },
}));

const getAuthStatus = mcpServersService.getAuthStatus as ReturnType<
  typeof vi.fn
>;

function renderPage() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<McpPage />, { wrapper });
}

describe('McpPage auth completion handler', () => {
  beforeEach(() => {
    mockParams = {};
    vi.clearAllMocks();
    window.history.replaceState(
      null,
      '',
      '/mcp?authorized=notion&namespace=team-a&auth_id=abc',
    );
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/mcp');
  });

  it('does nothing without auth params', () => {
    mockParams = { namespace: 'team-a' };
    renderPage();
    expect(getAuthStatus).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows expired toast for auth_error=expired without polling', async () => {
    mockParams = { auth_error: 'expired' };
    renderPage();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Authorization flow expired',
        expect.anything(),
      ),
    );
    expect(getAuthStatus).not.toHaveBeenCalled();
  });

  it('shows error toast with description for other auth_error', async () => {
    mockParams = {
      authorized: 'notion',
      namespace: 'team-a',
      auth_error: 'access_denied',
      auth_error_desc: 'User declined',
    };
    renderPage();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Authentication failed', {
        description: 'User declined',
      }),
    );
    expect(getAuthStatus).not.toHaveBeenCalled();
  });

  it('polls auth/status and toasts success on authorized', async () => {
    mockParams = { authorized: 'notion', namespace: 'team-a', auth_id: 'abc' };
    getAuthStatus.mockResolvedValue({ state: 'authorized' });
    renderPage();
    await waitFor(() =>
      expect(getAuthStatus).toHaveBeenCalledWith('notion', {
        namespace: 'team-a',
        authId: 'abc',
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Authentication complete',
        expect.anything(),
      ),
    );
  });

  it('toasts error with status message on failed', async () => {
    mockParams = { authorized: 'notion', namespace: 'team-a', auth_id: 'abc' };
    getAuthStatus.mockResolvedValue({ state: 'failed', message: 'boom' });
    renderPage();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Authentication failed', {
        description: 'boom',
      }),
    );
  });

  it('strips auth params after handling', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    mockParams = { authorized: 'notion', namespace: 'team-a', auth_id: 'abc' };
    getAuthStatus.mockResolvedValue({ state: 'authorized' });
    renderPage();
    await waitFor(() => expect(replaceState).toHaveBeenCalled());
    const lastUrl = replaceState.mock.calls.at(-1)?.[2] as string;
    expect(lastUrl).not.toContain('authorized=');
    expect(lastUrl).not.toContain('auth_id=');
    replaceState.mockRestore();
  });
});
