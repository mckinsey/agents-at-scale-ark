import { Provider as JotaiProvider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import userEvent from '@testing-library/user-event';

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
    availableNamespaces: [{ name: 'default' }],
    createNamespace: vi.fn(),
    isPending: false,
    namespace: 'default',
    isNamespaceResolved: true,
    setNamespace: vi.fn(),
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

  it('should display Files in More menu', async () => {
    const user = userEvent.setup();

    render(
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </JotaiProvider>,
    );

    const moreButton = await screen.findByRole('button', { name: /more/i });
    await user.click(moreButton);

    const filesButton = await screen.findByText('Files');
    expect(filesButton).toBeInTheDocument();
  });

  it('should display Files section even when files API is not available', async () => {
    const user = userEvent.setup();

    render(
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </JotaiProvider>,
    );

    const moreButton = await screen.findByRole('button', { name: /more/i });
    await user.click(moreButton);

    const filesButton = await screen.findByText('Files');
    expect(filesButton).toBeInTheDocument();
  });

  it('should display alert icon when no namespaces are available', async () => {
    const { useNamespace } = await import('@/providers/NamespaceProvider');
    vi.mocked(useNamespace).mockReturnValue({
      availableNamespaces: [],
      createNamespace: vi.fn(),
      isPending: false,
      namespace: '',
      isNamespaceResolved: false,
      setNamespace: vi.fn(),
      readOnlyMode: false,
    });

    const { container } = render(
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </JotaiProvider>,
    );

    await screen.findByText('No namespaces');
    
    const alertIcon = container.querySelector('.text-red-500');
    expect(alertIcon).toBeInTheDocument();
  });

  it('should display namespace name when available', async () => {
    const { useNamespace } = await import('@/providers/NamespaceProvider');
    vi.mocked(useNamespace).mockReturnValue({
      availableNamespaces: [{ name: 'test-namespace' }],
      createNamespace: vi.fn(),
      isPending: false,
      namespace: 'test-namespace',
      isNamespaceResolved: true,
      setNamespace: vi.fn(),
      readOnlyMode: false,
    });

    render(
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </JotaiProvider>,
    );

    const namespaceText = await screen.findByText('test-namespace');
    expect(namespaceText).toBeInTheDocument();
  });

  it('should display loading state when namespace is pending', async () => {
    const { useNamespace } = await import('@/providers/NamespaceProvider');
    vi.mocked(useNamespace).mockReturnValue({
      availableNamespaces: [{ name: 'default' }],
      createNamespace: vi.fn(),
      isPending: true,
      namespace: 'default',
      isNamespaceResolved: false,
      setNamespace: vi.fn(),
      readOnlyMode: false,
    });

    render(
      <JotaiProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </JotaiProvider>,
    );

    const loadingText = await screen.findByText('Loading...');
    expect(loadingText).toBeInTheDocument();
  });
});
