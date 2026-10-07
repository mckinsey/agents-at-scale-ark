import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GlobalProviders } from '@/providers/GlobalProviders';
import { useArgoUrl } from '@/providers/argo-url-provider';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/agents'),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams('')),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  NamespaceProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/providers/ContextProvider', () => ({
  ContextProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/lib/analytics/provider', () => ({
  AnalyticsProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/lib/chat-context', () => ({
  ChatProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/providers/QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/providers/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/providers/AuthProviders', () => ({
  OpenModeProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SSOModeProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

function ArgoUrlProbe() {
  return <div data-testid="argo-url">{useArgoUrl() ?? 'unset'}</div>;
}

describe('GlobalProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should render children', () => {
    render(
      <GlobalProviders>
        <div data-testid="child">Hello</div>
      </GlobalProviders>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('provides ARGO_URL read from the environment at render time', () => {
    vi.stubEnv('ARGO_URL', 'https://argo.example.com/');
    render(
      <GlobalProviders>
        <ArgoUrlProbe />
      </GlobalProviders>,
    );
    expect(screen.getByTestId('argo-url')).toHaveTextContent(
      'https://argo.example.com',
    );
  });

  it('provides no Argo URL when ARGO_URL is unset', () => {
    vi.stubEnv('ARGO_URL', '');
    render(
      <GlobalProviders>
        <ArgoUrlProbe />
      </GlobalProviders>,
    );
    expect(screen.getByTestId('argo-url')).toHaveTextContent('unset');
  });
});
