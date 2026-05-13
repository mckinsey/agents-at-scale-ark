import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/agents'),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  NamespaceProvider: ({ children }: { children: React.ReactNode }) => (
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

import { GlobalProviders } from '@/providers/GlobalProviders';

describe('GlobalProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render children', () => {
    render(
      <GlobalProviders>
        <div data-testid="child">Hello</div>
      </GlobalProviders>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
