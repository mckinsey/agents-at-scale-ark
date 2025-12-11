import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider } from 'jotai';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppSidebar } from '@/components/app-sidebar';
import { ExperimentalFeaturesDialog } from '@/components/experimental-features-dialog';
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
    isPending: false,
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
    get: vi.fn(() =>
      Promise.resolve({
        system_version: '1.0.0',
        kubernetes_version: '1.28.0',
      }),
    ),
  },
}));

describe('AppSidebar - Experimental Features Menu Item', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
    });
  });

  it('should show Experimental Features option in the namespace dropdown', async () => {
    const user = userEvent.setup();

    render(
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </JotaiProvider>,
    );

    const dropdownTrigger = screen.getByText('ARK Dashboard');
    await user.click(dropdownTrigger);

    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', { name: 'Experimental Features' }),
      ).toBeInTheDocument();
    });
  });

  it('should open experimental features dialog when Experimental Features is clicked', async () => {
    const user = userEvent.setup();

    render(
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
        <ExperimentalFeaturesDialog />
      </JotaiProvider>,
    );

    const dropdownTrigger = screen.getByText('ARK Dashboard');
    await user.click(dropdownTrigger);

    await waitFor(() => {
      expect(screen.getByText('Experimental Features')).toBeInTheDocument();
    });

    const settingsItem = screen.getByRole('menuitem', {
      name: 'Experimental Features',
    });
    await user.click(settingsItem);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Experimental features')).toBeInTheDocument();
    });
  });
});
