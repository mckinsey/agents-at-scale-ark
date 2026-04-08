import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider } from 'jotai';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppSidebar } from '@/components/app-sidebar';
import { SettingsModal } from '@/components/settings-modal';
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
    isPending: false,
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

describe('AppSidebar - Settings Menu Item', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
    });
  });

  it('should show Settings button in sidebar', async () => {
    render(
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </JotaiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });

  it('should open settings modal when Settings is clicked', async () => {
    const user = userEvent.setup();

    render(
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
        <SettingsModal />
      </JotaiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    const settingsButton = screen.getByText('Settings');
    await user.click(settingsButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
