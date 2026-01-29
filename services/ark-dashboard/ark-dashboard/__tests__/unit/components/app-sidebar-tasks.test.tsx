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
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    namespace: 'default',
    isNamespaceResolved: true,
    availableNamespaces: [{ name: 'default' }],
    loading: false,
    setNamespace: vi.fn(),
    createNamespace: vi.fn(),
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

describe('AppSidebar - A2A Tasks Menu Item', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
    });
  });

  it('should always show A2A Tasks menu item', async () => {
    render(
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </JotaiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('A2A Tasks')).toBeInTheDocument();
    });
  });

  it('should be in the Operations section', async () => {
    render(
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </JotaiProvider>,
    );

    await waitFor(() => {
      const operationsSection = screen
        .getByText('Operations')
        .closest('[data-sidebar="group"]');
      expect(operationsSection).toBeInTheDocument();

      const tasksButton = screen.getByText('A2A Tasks');
      expect(operationsSection).toContainElement(tasksButton);
    });
  });

  it('should navigate to /tasks when clicked', async () => {
    const user = userEvent.setup();

    render(
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </JotaiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('A2A Tasks')).toBeInTheDocument();
    });

    const tasksButton = screen.getByText('A2A Tasks');
    await user.click(tasksButton);

    expect(mockPush).toHaveBeenCalledWith('/tasks');
  });
});
