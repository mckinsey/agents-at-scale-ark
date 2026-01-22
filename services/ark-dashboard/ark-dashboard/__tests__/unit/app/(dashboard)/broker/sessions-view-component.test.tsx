import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import BrokerPage from '@/app/(dashboard)/broker/page';
import { SidebarProvider } from '@/components/ui/sidebar';

vi.mock('@/lib/services/memories', () => ({
  memoriesService: {
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

const MockRouter = ({ children }: { children: React.ReactNode }) => {
  const mockRouter: AppRouterInstance = {
    back: vi.fn(),
    forward: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  };

  return (
    <AppRouterContext.Provider value={mockRouter}>
      {children}
    </AppRouterContext.Provider>
  );
};

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
});

global.EventSource = vi.fn(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
  readyState: 0,
  url: '',
  withCredentials: false,
  CONNECTING: 0,
  OPEN: 1,
  CLOSED: 2,
  onerror: null,
  onmessage: null,
  onopen: null,
  dispatchEvent: vi.fn(),
})) as unknown as typeof EventSource;

function renderBrokerPage() {
  return render(
    <QueryClientProvider client={queryClient}>
      <JotaiProvider>
        <SidebarProvider>
          <MockRouter>
            <BrokerPage />
          </MockRouter>
        </SidebarProvider>
      </JotaiProvider>
    </QueryClientProvider>,
  );
}

describe('SessionsView Component', () => {
  it('should render all tab options including the new Sessions tab', async () => {
    renderBrokerPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /traces/i })).toBeDefined();
    });

    expect(screen.getByRole('tab', { name: /messages/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /chunks/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /events/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /sessions/i })).toBeDefined();
  });
});
