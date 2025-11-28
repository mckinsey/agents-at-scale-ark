import { render, screen, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EXPERIMENTAL_DARK_MODE_FEATURE_KEY,
  EXPERIMENTAL_FEATURES_ENABLED_KEY,
} from '@/atoms/experimental-features';
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

describe('AppSidebar - Logo Switching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should render light logo by default (feature flag disabled)', async () => {
    render(
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </JotaiProvider>,
    );

    await waitFor(() => {
      const logo = screen.getByAltText('ARK');
      expect(logo).toBeInTheDocument();

      const image = screen.getByAltText('ARK') as HTMLImageElement;
      expect(image.src).toEqual(expect.stringContaining('qb-logo-light.svg'));
    });
  });

  it('should render dark logo when feature flag is enabled', async () => {
    localStorage.setItem(EXPERIMENTAL_FEATURES_ENABLED_KEY, 'true');
    localStorage.setItem(EXPERIMENTAL_DARK_MODE_FEATURE_KEY, 'true');

    render(
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </JotaiProvider>,
    );

    await waitFor(() => {
      const image = screen.getByAltText('ARK') as HTMLImageElement;
      expect(image.src).toEqual(expect.stringContaining('qb-logo-dark.svg'));
    });
  });
});
