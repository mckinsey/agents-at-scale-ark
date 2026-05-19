import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider } from 'jotai';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    namespace: 'default',
    isNamespaceResolved: true,
    availableNamespaces: [{ name: 'default' }],
    loading: false,
    setNamespace: vi.fn(),
    createNamespace: vi.fn(),
    readOnlyMode: false,
  })),
}));

vi.mock('@/providers/UserProvider', () => ({
  useUser: vi.fn(() => ({
    user: { name: 'Test User', email: 'test@example.com' },
  })),
}));

vi.mock('@/lib/services/system-info', () => ({
  systemInfoService: {
    getSystemInfo: vi.fn(() =>
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

const renderSidebar = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </JotaiProvider>
    </QueryClientProvider>,
  );
};

describe('AppSidebar - A2A Tasks Menu Item', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
    });
  });

  it('should show A2A in Other group', async () => {
    const user = userEvent.setup();

    renderSidebar();

    const otherButton = await screen.findByRole('button', { name: /other/i });
    await user.click(otherButton);

    await waitFor(() => {
      expect(screen.getByText('A2A')).toBeInTheDocument();
    });
  });

  it('should navigate to /a2a when A2A is clicked', async () => {
    const user = userEvent.setup();

    renderSidebar();

    const otherButton = await screen.findByRole('button', { name: /other/i });
    await user.click(otherButton);

    await waitFor(() => {
      expect(screen.getByText('A2A')).toBeInTheDocument();
    });

    const a2aButton = screen.getByRole('button', { name: /a2a/i });
    await user.click(a2aButton);

    expect(mockPush).toHaveBeenCalledWith('/a2a');
  });

  it('should render sidebar without errors', async () => {
    renderSidebar();

    await waitFor(() => {
      expect(screen.getByText('ARK')).toBeInTheDocument();
    });
  });
});
