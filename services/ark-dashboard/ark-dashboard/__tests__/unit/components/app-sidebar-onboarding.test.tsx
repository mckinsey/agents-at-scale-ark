import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';

import { onboardingPhaseAtom, tourStepAtom } from '@/atoms/onboarding';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TOUR_STEPS } from '@/lib/constants/tour-steps';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('next/image', () => ({
  default: vi.fn(({ alt }) => <img alt={alt} />),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    isPending: false,
    namespace: 'default',
    isNamespaceResolved: true,
    readOnlyMode: false,
  })),
}));

vi.mock('@/providers/UserProvider', () => ({
  useUser: vi.fn(() => ({
    user: { name: 'Test User', email: 'test@example.com' },
  })),
}));

vi.mock('@/lib/services', () => ({
  systemInfoService: {
    get: vi.fn(() =>
      Promise.resolve({
        system_version: '1.0.0',
        kubernetes_version: '1.28.0',
      }),
    ),
  },
}));

vi.mock('@/lib/services/proxy', () => ({
  proxyService: {
    getSystemInfo: vi.fn(() => Promise.resolve({})),
    isServiceAvailable: vi.fn(() => Promise.resolve(true)),
  },
}));

vi.mock('@/lib/services/files-count-hooks', () => ({
  useGetFilesCount: vi.fn(() => ({
    data: 0,
    isPending: false,
  })),
}));

vi.mock('@/lib/services/events-hooks', () => ({
  useGetEventsCount: vi.fn(() => ({
    data: 0,
    isPending: false,
  })),
}));

vi.mock('@/lib/services/workflow-templates-hooks', () => ({
  useGetAllWorkflowTemplates: vi.fn(() => ({
    data: [],
    isPending: false,
  })),
}));

vi.mock('@/lib/services/namespaces-hooks', () => ({
  useGetAllNamespaces: vi.fn(() => ({
    data: [{ name: 'default' }],
    isPending: false,
  })),
}));

vi.mock('@/components/user', () => ({
  UserDetails: vi.fn(() => <div data-testid="user-details" />),
}));

const renderSidebar = (store: ReturnType<typeof createStore>) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <JotaiProvider store={store}>
        <SidebarProvider defaultOpen={false}>
          <AppSidebar />
        </SidebarProvider>
      </JotaiProvider>
    </QueryClientProvider>,
  );
};

const tourStore = (targetId: string) => {
  const store = createStore();
  store.set(
    tourStepAtom,
    TOUR_STEPS.findIndex(step => step.targetId === targetId),
  );
  store.set(onboardingPhaseAtom, 'tour');
  return store;
};

describe('AppSidebar - onboarding tour', () => {
  it('exposes a tour target for every step', async () => {
    renderSidebar(tourStore('nav-agents'));
    await screen.findByRole('button', { name: 'Teams' });
    for (const step of TOUR_STEPS) {
      expect(
        document.querySelector(`[data-onboarding-id="${step.targetId}"]`),
      ).not.toBeNull();
    }
  });

  it('expands Agent builder when the tour reaches Teams', async () => {
    renderSidebar(tourStore('nav-teams'));
    expect(
      await screen.findByRole('button', { name: 'Teams' }),
    ).toHaveAttribute('data-onboarding-id', 'nav-teams');
  });

  it('expands Monitoring when the tour reaches it', async () => {
    renderSidebar(tourStore('nav-monitoring'));
    expect(
      await screen.findByRole('button', { name: 'Sessions' }),
    ).toBeInTheDocument();
  });

  it('keeps sections collapsed when the tour is not running', () => {
    const store = createStore();
    store.set(onboardingPhaseAtom, 'paused');
    store.set(tourStepAtom, 3);
    renderSidebar(store);
    expect(
      screen.queryByRole('button', { name: 'Agents' }),
    ).not.toBeInTheDocument();
  });
});
