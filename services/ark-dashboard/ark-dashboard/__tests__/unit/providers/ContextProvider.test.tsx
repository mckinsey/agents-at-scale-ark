import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError } from '@/lib/api/client';
import { ContextProvider } from '@/providers/ContextProvider';

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => new URLSearchParams('')),
}));

const mockGetContext = vi.fn();

vi.mock('@/lib/services/namespaces-hooks', () => ({
  useGetContext: () => mockGetContext(),
}));

vi.mock('@/providers/UserProvider', () => ({
  useUser: () => ({ user: { email: 'dwmkerr-agent@example.com' } }),
}));

function renderWithData(data: unknown, enabled = true) {
  mockGetContext.mockReturnValue({ data, isPending: false, error: null });
  return render(
    <ContextProvider enabled={enabled}>
      <div data-testid="app">app</div>
    </ContextProvider>,
  );
}

describe('ContextProvider gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders session-expired when the context call returns 401', () => {
    mockGetContext.mockReturnValue({
      data: undefined,
      isPending: false,
      error: new APIError('Unauthorized', 401),
    });
    render(
      <ContextProvider enabled>
        <div data-testid="app">app</div>
      </ContextProvider>,
    );
    expect(screen.queryByTestId('app')).not.toBeInTheDocument();
    expect(screen.getByText(/Session expired/i)).toBeInTheDocument();
  });

  it('renders the app when essential access is present', () => {
    renderWithData({
      namespace: 'demo',
      cluster: null,
      read_only_mode: false,
      permissions: {
        status: 'ok',
        reason: null,
        rules: {
          agents: ['list'],
          models: ['list'],
          queries: ['list'],
          teams: ['list'],
          tools: ['list'],
        },
      },
    });
    expect(screen.getByTestId('app')).toBeInTheDocument();
  });

  it('renders access denied when essential access is missing', () => {
    renderWithData({
      namespace: 'demo',
      cluster: null,
      read_only_mode: false,
      permissions: { status: 'ok', reason: null, rules: {} },
    });
    expect(screen.queryByTestId('app')).not.toBeInTheDocument();
    expect(
      screen.getByText(/No access to this namespace/i),
    ).toBeInTheDocument();
  });

  it('renders cluster unavailable when authz could not be evaluated', () => {
    renderWithData({
      namespace: 'demo',
      cluster: null,
      read_only_mode: false,
      permissions: {
        status: 'unavailable',
        reason: 'webhook authorizer unavailable',
        rules: {},
      },
    });
    expect(screen.queryByTestId('app')).not.toBeInTheDocument();
    expect(screen.getByText(/Cluster unavailable/i)).toBeInTheDocument();
  });

  it('renders the app when permissions are absent (open mode)', () => {
    renderWithData({ namespace: 'demo', cluster: null, read_only_mode: false });
    expect(screen.getByTestId('app')).toBeInTheDocument();
  });

  it('renders children while the context call is pending (no gate)', () => {
    mockGetContext.mockReturnValue({
      data: undefined,
      isPending: true,
      error: null,
    });
    render(
      <ContextProvider enabled>
        <div data-testid="app">app</div>
      </ContextProvider>,
    );
    expect(screen.getByTestId('app')).toBeInTheDocument();
  });

  it('never gates in open mode (enabled=false), even when access is denied', () => {
    renderWithData(
      {
        namespace: 'demo',
        cluster: null,
        read_only_mode: false,
        permissions: { status: 'ok', reason: null, rules: {} },
      },
      false,
    );
    expect(screen.getByTestId('app')).toBeInTheDocument();
    expect(
      screen.queryByText(/No access to this namespace/i),
    ).not.toBeInTheDocument();
  });
});
