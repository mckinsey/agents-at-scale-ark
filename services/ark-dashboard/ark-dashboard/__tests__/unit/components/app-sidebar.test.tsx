import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/'),
}));

vi.mock('next/image', () => ({
  default: vi.fn(({ alt }) => <img alt={alt} />),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    availableNamespaces: [{ name: 'default' }],
    createNamespace: vi.fn(),
    isPending: false,
    namespace: 'default',
    isNamespaceResolved: true,
    setNamespace: vi.fn(),
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

vi.mock('@/lib/services/files', () => ({
  filesService: {
    list: vi.fn(() => Promise.reject(new Error('Files API not available'))),
  },
}));

vi.mock('@/components/editors', () => ({
  NamespaceEditor: vi.fn(() => <div data-testid="namespace-editor" />),
}));

vi.mock('@/components/user', () => ({
  UserDetails: vi.fn(() => <div data-testid="user-details" />),
}));

describe('AppSidebar - Files Section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should always display Files section in sidebar regardless of API availability', async () => {
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    const filesLink = await screen.findByRole('button', { name: /files/i });
    expect(filesLink).toBeInTheDocument();
  });

  it('should display Files section even when files API is not available', async () => {
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    const filesLink = await screen.findByRole('button', { name: /files/i });
    expect(filesLink).toBeInTheDocument();
  });
});
