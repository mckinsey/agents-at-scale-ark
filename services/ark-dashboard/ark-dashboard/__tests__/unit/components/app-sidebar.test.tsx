import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

vi.mock('@/lib/services/namespaces-hooks', () => ({
  useGetAllNamespaces: vi.fn(() => ({
    data: [{ name: 'default' }],
    isPending: false,
  })),
}));

vi.mock('@/components/editors', () => ({
  NamespaceEditor: vi.fn(() => <div data-testid="namespace-editor" />),
}));

vi.mock('@/components/user', () => ({
  UserDetails: vi.fn(() => <div data-testid="user-details" />),
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

describe('AppSidebar - Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
    });
  });

  it('should preserve query parameters when navigating', async () => {
    const mockPush = vi.fn();
    const { useRouter } = await import('next/navigation');
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as ReturnType<typeof useRouter>);

    Object.defineProperty(window, 'location', {
      value: { search: '?namespace=test-ns&foo=bar' },
      writable: true,
    });

    const user = userEvent.setup();

    renderSidebar();

    const modelsButton = await screen.findByRole('button', { name: /models/i });
    await user.click(modelsButton);

    expect(mockPush).toHaveBeenCalledWith('/models?namespace=test-ns&foo=bar');
  });

  it('should navigate without query string when no params exist', async () => {
    const mockPush = vi.fn();
    const { useRouter } = await import('next/navigation');
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as ReturnType<typeof useRouter>);

    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
    });

    const user = userEvent.setup();

    renderSidebar();

    const mcpButton = await screen.findByRole('button', { name: /mcps/i });
    await user.click(mcpButton);

    expect(mockPush).toHaveBeenCalledWith('/mcp');
  });
});

describe('AppSidebar - Files Section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display Files in Other group', async () => {
    const user = userEvent.setup();

    renderSidebar();

    const otherButton = await screen.findByRole('button', { name: /other/i });
    await user.click(otherButton);

    const filesButton = await screen.findByText('Files');
    expect(filesButton).toBeInTheDocument();
  });

  it('should display Files section even when files API is not available', async () => {
    const user = userEvent.setup();

    renderSidebar();

    const otherButton = await screen.findByRole('button', { name: /other/i });
    await user.click(otherButton);

    const filesButton = await screen.findByText('Files');
    expect(filesButton).toBeInTheDocument();
  });

  it('should show Secrets in Other group', async () => {
    const user = userEvent.setup();

    renderSidebar();

    const otherButton = await screen.findByRole('button', { name: /other/i });
    await user.click(otherButton);

    const secretsButton = await screen.findByText('Secrets');
    expect(secretsButton).toBeInTheDocument();
  });

  it('should navigate to /secrets when Secrets is clicked', async () => {
    const mockPush = vi.fn();
    const { useRouter } = await import('next/navigation');
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as ReturnType<typeof useRouter>);

    const user = userEvent.setup();

    renderSidebar();

    const otherButton = await screen.findByRole('button', { name: /other/i });
    await user.click(otherButton);

    const secretsButton = await screen.findByRole('button', { name: /secrets/i });
    await user.click(secretsButton);

    expect(mockPush).toHaveBeenCalledWith('/secrets');
  });

  it('should show API keys in Other group', async () => {
    const user = userEvent.setup();

    renderSidebar();

    const otherButton = await screen.findByRole('button', { name: /other/i });
    await user.click(otherButton);

    const apiKeysButton = await screen.findByText('API keys');
    expect(apiKeysButton).toBeInTheDocument();
  });

  it('should navigate to /api-keys when API keys is clicked', async () => {
    const mockPush = vi.fn();
    const { useRouter } = await import('next/navigation');
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as ReturnType<typeof useRouter>);

    const user = userEvent.setup();

    renderSidebar();

    const otherButton = await screen.findByRole('button', { name: /other/i });
    await user.click(otherButton);

    const apiKeysButton = await screen.findByRole('button', { name: /api keys/i });
    await user.click(apiKeysButton);

    expect(mockPush).toHaveBeenCalledWith('/api-keys');
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

    renderSidebar();

    const namespaceText = await screen.findByText('test-namespace');
    expect(namespaceText).toBeInTheDocument();
  });
});

describe('AppSidebar - General Group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show Memory in General group', async () => {
    renderSidebar();

    const memoryButton = await screen.findByRole('button', { name: /memory/i });
    expect(memoryButton).toBeInTheDocument();
  });

  it('should navigate to /memory when Memory is clicked', async () => {
    const mockPush = vi.fn();
    const { useRouter } = await import('next/navigation');
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as ReturnType<typeof useRouter>);

    const user = userEvent.setup();

    renderSidebar();

    const memoryButton = await screen.findByRole('button', { name: /memory/i });
    await user.click(memoryButton);

    expect(mockPush).toHaveBeenCalledWith('/memory');
  });

  it('should show Marketplace in General group', async () => {
    renderSidebar();

    const marketplaceButton = await screen.findByRole('button', { name: /marketplace/i });
    expect(marketplaceButton).toBeInTheDocument();
  });

  it('should navigate to /marketplace when Marketplace is clicked', async () => {
    const mockPush = vi.fn();
    const { useRouter } = await import('next/navigation');
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as ReturnType<typeof useRouter>);

    const user = userEvent.setup();

    renderSidebar();

    const marketplaceButton = await screen.findByRole('button', { name: /marketplace/i });
    await user.click(marketplaceButton);

    expect(mockPush).toHaveBeenCalledWith('/marketplace');
  });
});
