import { Provider as JotaiProvider } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';

const mockSetNamespace = vi.fn();
const mockCreateNamespace = vi.fn();

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
    availableNamespaces: [
      { name: 'default' },
      { name: 'staging' },
      { name: 'production' },
    ],
    capabilities: { can_create_namespace: false },
    createNamespace: mockCreateNamespace,
    isPending: false,
    namespace: 'default',
    isNamespaceResolved: true,
    setNamespace: mockSetNamespace,
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
  NamespaceEditor: vi.fn(({ open }: { open: boolean }) =>
    open ? <div data-testid="namespace-editor" /> : null,
  ),
}));

vi.mock('@/components/user', () => ({
  UserDetails: vi.fn(() => <div data-testid="user-details" />),
}));

function renderSidebar() {
  return render(
    <JotaiProvider>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </JotaiProvider>,
  );
}

describe('Namespace Dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('with multiple namespaces', () => {
    it('should show current namespace in the trigger', async () => {
      renderSidebar();
      const trigger = await screen.findByTestId('namespace-dropdown-trigger');
      expect(trigger).toHaveTextContent('default');
    });

    it('should be enabled when multiple namespaces are available', async () => {
      renderSidebar();
      const trigger = await screen.findByTestId('namespace-dropdown-trigger');
      expect(trigger).not.toBeDisabled();
    });

    it('should list all namespaces when opened', async () => {
      const user = userEvent.setup();
      renderSidebar();

      const trigger = await screen.findByTestId('namespace-dropdown-trigger');
      await user.click(trigger);

      expect(await screen.findByText('staging')).toBeInTheDocument();
      expect(screen.getByText('production')).toBeInTheDocument();
    });

    it('should call setNamespace when a namespace is selected', async () => {
      const user = userEvent.setup();
      renderSidebar();

      const trigger = await screen.findByTestId('namespace-dropdown-trigger');
      await user.click(trigger);

      const stagingOption = await screen.findByText('staging');
      await user.click(stagingOption);

      expect(mockSetNamespace).toHaveBeenCalledWith('staging');
    });
  });

  describe('with single namespace (disabled state)', () => {
    it('should be disabled when only one namespace is available', async () => {
      const { useNamespace } = await import('@/providers/NamespaceProvider');
      vi.mocked(useNamespace).mockReturnValue({
        availableNamespaces: [{ name: 'default' }],
        capabilities: { can_create_namespace: false },
        createNamespace: mockCreateNamespace,
        isPending: false,
        namespace: 'default',
        isNamespaceResolved: true,
        setNamespace: mockSetNamespace,
        readOnlyMode: false,
      });

      renderSidebar();
      const trigger = await screen.findByTestId('namespace-dropdown-trigger');
      expect(trigger).toBeDisabled();
    });

    it('should still show the namespace name when disabled', async () => {
      const { useNamespace } = await import('@/providers/NamespaceProvider');
      vi.mocked(useNamespace).mockReturnValue({
        availableNamespaces: [{ name: 'only-namespace' }],
        capabilities: { can_create_namespace: false },
        createNamespace: mockCreateNamespace,
        isPending: false,
        namespace: 'only-namespace',
        isNamespaceResolved: true,
        setNamespace: mockSetNamespace,
        readOnlyMode: false,
      });

      renderSidebar();
      const trigger = await screen.findByTestId('namespace-dropdown-trigger');
      expect(trigger).toHaveTextContent('only-namespace');
      expect(trigger).toBeDisabled();
    });
  });

  describe('create namespace capability', () => {
    it('should show "Create Namespace" option when can_create_namespace is true', async () => {
      const { useNamespace } = await import('@/providers/NamespaceProvider');
      vi.mocked(useNamespace).mockReturnValue({
        availableNamespaces: [
          { name: 'default' },
          { name: 'staging' },
        ],
        capabilities: { can_create_namespace: true },
        createNamespace: mockCreateNamespace,
        isPending: false,
        namespace: 'default',
        isNamespaceResolved: true,
        setNamespace: mockSetNamespace,
        readOnlyMode: false,
      });

      const user = userEvent.setup();
      renderSidebar();

      const trigger = await screen.findByTestId('namespace-dropdown-trigger');
      await user.click(trigger);

      expect(
        await screen.findByTestId('create-namespace-option'),
      ).toBeInTheDocument();
      expect(screen.getByText('Create Namespace')).toBeInTheDocument();
    });

    it('should not show "Create Namespace" option when can_create_namespace is false', async () => {
      const { useNamespace } = await import('@/providers/NamespaceProvider');
      vi.mocked(useNamespace).mockReturnValue({
        availableNamespaces: [
          { name: 'default' },
          { name: 'staging' },
        ],
        capabilities: { can_create_namespace: false },
        createNamespace: mockCreateNamespace,
        isPending: false,
        namespace: 'default',
        isNamespaceResolved: true,
        setNamespace: mockSetNamespace,
        readOnlyMode: false,
      });

      const user = userEvent.setup();
      renderSidebar();

      const trigger = await screen.findByTestId('namespace-dropdown-trigger');
      await user.click(trigger);

      await screen.findByText('staging');
      expect(screen.queryByText('Create Namespace')).not.toBeInTheDocument();
    });

    it('should open NamespaceEditor when "Create Namespace" is clicked', async () => {
      const { useNamespace } = await import('@/providers/NamespaceProvider');
      vi.mocked(useNamespace).mockReturnValue({
        availableNamespaces: [
          { name: 'default' },
          { name: 'staging' },
        ],
        capabilities: { can_create_namespace: true },
        createNamespace: mockCreateNamespace,
        isPending: false,
        namespace: 'default',
        isNamespaceResolved: true,
        setNamespace: mockSetNamespace,
        readOnlyMode: false,
      });

      const user = userEvent.setup();
      renderSidebar();

      const trigger = await screen.findByTestId('namespace-dropdown-trigger');
      await user.click(trigger);

      const createOption = await screen.findByTestId(
        'create-namespace-option',
      );
      await user.click(createOption);

      expect(
        await screen.findByTestId('namespace-editor'),
      ).toBeInTheDocument();
    });
  });

  describe('loading and empty states', () => {
    it('should show "Loading..." when pending', async () => {
      const { useNamespace } = await import('@/providers/NamespaceProvider');
      vi.mocked(useNamespace).mockReturnValue({
        availableNamespaces: [],
        capabilities: { can_create_namespace: false },
        createNamespace: mockCreateNamespace,
        isPending: true,
        namespace: 'default',
        isNamespaceResolved: false,
        setNamespace: mockSetNamespace,
        readOnlyMode: false,
      });

      renderSidebar();
      const trigger = await screen.findByTestId('namespace-dropdown-trigger');
      expect(trigger).toHaveTextContent('Loading...');
    });

    it('should show "No namespaces" when empty and not pending', async () => {
      const { useNamespace } = await import('@/providers/NamespaceProvider');
      vi.mocked(useNamespace).mockReturnValue({
        availableNamespaces: [],
        capabilities: { can_create_namespace: false },
        createNamespace: mockCreateNamespace,
        isPending: false,
        namespace: '',
        isNamespaceResolved: false,
        setNamespace: mockSetNamespace,
        readOnlyMode: false,
      });

      renderSidebar();
      const trigger = await screen.findByTestId('namespace-dropdown-trigger');
      expect(trigger).toHaveTextContent('No namespaces');
    });
  });
});
