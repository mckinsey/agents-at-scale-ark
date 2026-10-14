import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import copy from 'copy-to-clipboard';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MarketplaceItem } from '@/lib/api/generated/marketplace-types';
import { useMarketplaceInstallCapability } from '@/lib/hooks/use-marketplace-install-capability';
import { useInstallMarketplaceItem } from '@/lib/services/marketplace-hooks';

import { MarketplaceItemCard } from './marketplace-item-card';

const namespaceState = { readOnlyMode: false };

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: namespaceState.readOnlyMode,
  }),
}));
vi.mock('@/lib/hooks/use-marketplace-install-capability');
vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/services/marketplace-hooks');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('copy-to-clipboard');

const mockMutateAsync = vi.fn();
const mockUseInstallMarketplaceItem = vi.mocked(useInstallMarketplaceItem);
const mockUseMarketplaceInstallCapability = vi.mocked(
  useMarketplaceInstallCapability,
);
const mockCopy = vi.mocked(copy);

function makeItem(overrides?: Partial<MarketplaceItem>): MarketplaceItem {
  return {
    id: 'test-item',
    name: 'Test Item',
    description: 'A test item',
    shortDescription: 'A test',
    category: 'tools',
    type: 'component',
    version: '1.0.0',
    author: 'Test',
    status: 'available',
    installable: true,
    featured: false,
    downloads: 0,
    tags: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    uis: undefined,
    ...overrides,
  };
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('MarketplaceItemCard', () => {
  beforeEach(() => {
    // atomWithStorage reads localStorage on init, and jsdom keeps it between
    // tests — so records would leak from one test into the next.
    localStorage.clear();
    namespaceState.readOnlyMode = false;
    vi.clearAllMocks();
    mockUseInstallMarketplaceItem.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useInstallMarketplaceItem>);
  });

  it('renders item name and shortDescription', () => {
    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    expect(screen.getByText('Test Item')).toBeInTheDocument();
    expect(screen.getByText('A test')).toBeInTheDocument();
  });

  it('renders version', () => {
    renderWithProviders(
      <MarketplaceItemCard item={makeItem({ version: '2.3.1' })} />,
    );

    expect(screen.getByText('v2.3.1')).toBeInTheDocument();
  });

  it('renders service type badge with Server icon', () => {
    renderWithProviders(
      <MarketplaceItemCard item={makeItem({ type: 'service' })} />,
    );

    expect(screen.getByText('service')).toBeInTheDocument();
  });

  it('renders Agent text for agents category', () => {
    renderWithProviders(
      <MarketplaceItemCard
        item={makeItem({ category: 'agents', type: 'component' })}
      />,
    );

    expect(screen.getByText('Agent')).toBeInTheDocument();
  });

  it('renders View button for demo items and opens repository URL', () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const demoUrl = 'https://github.com/example/demo';

    renderWithProviders(
      <MarketplaceItemCard
        item={makeItem({ type: 'demo', repository: demoUrl })}
      />,
    );

    const viewButton = screen.getByRole('button', { name: /view/i });
    expect(viewButton).toBeInTheDocument();
    expect(viewButton).not.toBeDisabled();

    fireEvent.click(viewButton);

    expect(spy).toHaveBeenCalledWith(demoUrl, '_blank', 'noopener,noreferrer');

    spy.mockRestore();
  });

  it('renders up to 4 tags', () => {
    renderWithProviders(
      <MarketplaceItemCard item={makeItem({ tags: ['a', 'b', 'c', 'd'] })} />,
    );

    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('c')).toBeInTheDocument();
    expect(screen.getByText('d')).toBeInTheDocument();
  });

  it('shows overflow badge when more than 4 tags', () => {
    renderWithProviders(
      <MarketplaceItemCard
        item={makeItem({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] })}
      />,
    );

    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('d')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.queryByText('e')).not.toBeInTheDocument();
    expect(screen.queryByText('f')).not.toBeInTheDocument();
  });

  it('install button click triggers mutation', async () => {
    mockMutateAsync.mockResolvedValue({});
    const user = userEvent.setup();

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    await user.click(screen.getByRole('button', { name: /get/i }));

    expect(mockMutateAsync).toHaveBeenCalledWith('test-item');
  });

  it('shows loading state during install', async () => {
    let resolveInstall: (value: unknown) => void;
    mockMutateAsync.mockReturnValue(
      new Promise(resolve => {
        resolveInstall = resolve;
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    await user.click(screen.getByRole('button', { name: /get/i }));

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    resolveInstall!({});
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  it('shows installed state after successful install', async () => {
    mockMutateAsync.mockResolvedValue({ status: 'installed' });
    const user = userEvent.setup();
    const { toast } = await import('sonner');

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    await user.click(screen.getByRole('button', { name: /get/i }));

    await waitFor(() => {
      expect(screen.getByText('Installed')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /installed/i })).toBeDisabled();
    expect(toast.success).toHaveBeenCalledWith(
      'Test Item installed successfully',
    );
  });

  it('opens command dialog on command response', async () => {
    mockMutateAsync.mockResolvedValue({
      status: 'command',
      helmCommand: 'helm install test',
      arkCommand: 'ark install test',
    });
    const user = userEvent.setup();

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    await user.click(screen.getByRole('button', { name: /get/i }));

    await waitFor(() => {
      expect(screen.getByText('helm install test')).toBeInTheDocument();
    });
    expect(screen.getByText('ark install test')).toBeInTheDocument();
  });

  it('opens command dialog on error with command status', async () => {
    mockMutateAsync.mockRejectedValue({
      data: {
        status: 'command',
        helmCommand: 'helm install error-test',
        arkCommand: 'ark install error-test',
      },
    });
    const user = userEvent.setup();

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    await user.click(screen.getByRole('button', { name: /get/i }));

    await waitFor(() => {
      expect(screen.getByText('helm install error-test')).toBeInTheDocument();
    });
    expect(screen.getByText('ark install error-test')).toBeInTheDocument();
  });

  it('shows error toast on install failure', async () => {
    mockMutateAsync.mockRejectedValue({
      data: {
        error: 'Install failed',
        details: 'Missing namespace',
      },
    });
    const user = userEvent.setup();
    const { toast } = await import('sonner');

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    await user.click(screen.getByRole('button', { name: /get/i }));

    await waitFor(() => {
      // The sonner wrapper drops `description`, so the detail is folded into
      // the message or it would never be shown.
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to install Test Item: Missing namespace',
        expect.objectContaining({ duration: 8000 }),
      );
    });
  });

  it('shows error toast with error message when no data details', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    const { toast } = await import('sonner');

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    await user.click(screen.getByRole('button', { name: /get/i }));

    await waitFor(() => {
      // The sonner wrapper drops `description`, so the detail is folded into
      // the message or it would never be shown.
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to install Test Item: Network error',
        expect.objectContaining({ duration: 8000 }),
      );
    });
  });

  describe('UI buttons for installed items', () => {
    it('renders UI buttons when item is installed and has uis array', () => {
      const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

      renderWithProviders(
        <MarketplaceItemCard
          item={makeItem({
            status: 'installed',
            uis: [
              {
                url: 'https://phoenix.example.com',
                label: 'Phoenix Dashboard',
              },
            ],
          })}
        />,
      );

      const uiButton = screen.getByRole('button', {
        name: /phoenix dashboard/i,
      });
      expect(uiButton).toBeInTheDocument();

      fireEvent.click(uiButton);
      expect(spy).toHaveBeenCalledWith(
        'https://phoenix.example.com',
        '_blank',
        'noopener,noreferrer',
      );

      spy.mockRestore();
    });

    it('renders multiple UI buttons when item has multiple uis', () => {
      renderWithProviders(
        <MarketplaceItemCard
          item={makeItem({
            status: 'installed',
            uis: [
              { url: 'https://phoenix.example.com', label: 'Phoenix' },
              { url: 'https://minio.example.com', label: 'MinIO' },
            ],
          })}
        />,
      );

      expect(
        screen.getByRole('button', { name: /phoenix/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /minio/i }),
      ).toBeInTheDocument();
    });

    it('does not render UI buttons when item is not installed', () => {
      renderWithProviders(
        <MarketplaceItemCard
          item={makeItem({
            status: 'available',
            uis: [{ url: 'https://phoenix.example.com', label: 'Phoenix' }],
          })}
        />,
      );

      expect(
        screen.queryByRole('button', { name: /phoenix/i }),
      ).not.toBeInTheDocument();
    });

    it('does not render UI buttons when uis array is empty', () => {
      renderWithProviders(
        <MarketplaceItemCard
          item={makeItem({
            status: 'installed',
            uis: [],
          })}
        />,
      );

      expect(screen.getByText('Installed')).toBeInTheDocument();
    });

    it('does not render UI buttons when uis is undefined', () => {
      renderWithProviders(
        <MarketplaceItemCard
          item={makeItem({
            status: 'installed',
          })}
        />,
      );

      expect(screen.getByText('Installed')).toBeInTheDocument();
    });

    it('opens URL in new tab when UI button is clicked', () => {
      const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

      renderWithProviders(
        <MarketplaceItemCard
          item={makeItem({
            status: 'installed',
            uis: [{ url: 'https://test.example.com', label: 'Test UI' }],
          })}
        />,
      );

      const uiButton = screen.getByRole('button', { name: /test ui/i });
      fireEvent.click(uiButton);

      expect(spy).toHaveBeenCalledWith(
        'https://test.example.com',
        '_blank',
        'noopener,noreferrer',
      );
      spy.mockRestore();
    });
  });
});

describe('InstallCommandDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInstallMarketplaceItem.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useInstallMarketplaceItem>);
  });

  async function openDialogWithCommands(commands: {
    helmCommand?: string;
    arkCommand?: string;
  }) {
    const user = userEvent.setup();
    mockMutateAsync.mockResolvedValue({ status: 'command', ...commands });

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);
    await user.click(screen.getByRole('button', { name: /get/i }));

    const commandText = commands.arkCommand || commands.helmCommand!;
    await waitFor(() => {
      expect(screen.getByText(commandText)).toBeInTheDocument();
    });

    return user;
  }

  function getCopyButtonsInDialog(): HTMLElement[] {
    const dialog = screen.getByRole('dialog');
    const allButtons = Array.from(
      dialog.querySelectorAll('button'),
    ) as HTMLElement[];
    const closeBtn = dialog.querySelector('[data-slot="dialog-close"]');
    return allButtons.filter(b => b !== closeBtn);
  }

  it('copy to clipboard calls copy library and shows success toast', async () => {
    const { toast } = await import('sonner');

    mockCopy.mockReturnValue(true);

    await openDialogWithCommands({
      arkCommand: 'ark install test',
      helmCommand: 'helm install test',
    });

    const copyButtons = getCopyButtonsInDialog();
    expect(copyButtons.length).toBe(2);

    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(mockCopy).toHaveBeenCalledWith('ark install test');
    });
    expect(toast.success).toHaveBeenCalledWith('Command copied to clipboard');
  });

  it('copy failure shows error toast', async () => {
    const { toast } = await import('sonner');

    mockCopy.mockReturnValue(false);

    await openDialogWithCommands({
      arkCommand: 'ark install test',
    });

    const copyButtons = getCopyButtonsInDialog();
    expect(copyButtons.length).toBe(1);
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to copy to clipboard');
    });
  });

  it('shows both helm and ark command sections', async () => {
    await openDialogWithCommands({
      helmCommand: 'helm install my-chart',
      arkCommand: 'ark marketplace install my-item',
    });

    expect(screen.getByText('Using Ark CLI (Recommended)')).toBeInTheDocument();
    expect(screen.getByText('Using Helm directly')).toBeInTheDocument();
    expect(
      screen.getByText('ark marketplace install my-item'),
    ).toBeInTheDocument();
    expect(screen.getByText('helm install my-chart')).toBeInTheDocument();
  });

  it('shows kubectl tip', async () => {
    await openDialogWithCommands({ arkCommand: 'ark install test' });

    expect(
      screen.getByText(/Make sure you have kubectl configured/),
    ).toBeInTheDocument();
  });
});

describe('MarketplaceItemCard install states', () => {
  beforeEach(() => {
    mockUseInstallMarketplaceItem.mockReturnValue({
      mutateAsync: mockMutateAsync,
    } as unknown as ReturnType<typeof useInstallMarketplaceItem>);
  });

  it('renders Get when the install capability is off', () => {
    mockUseMarketplaceInstallCapability.mockReturnValue(false);

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    expect(screen.getByRole('button', { name: /get/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^install$/i }),
    ).not.toBeInTheDocument();
  });

  it('renders Install when the install capability is on', () => {
    mockUseMarketplaceInstallCapability.mockReturnValue(true);

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    expect(
      screen.getByRole('button', { name: /^install$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /get/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the installed status instead of an action', () => {
    mockUseMarketplaceInstallCapability.mockReturnValue(true);

    renderWithProviders(
      <MarketplaceItemCard item={makeItem({ status: 'installed' })} />,
    );

    expect(screen.getByText('Installed')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^install$/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the platform managed status for a non-installable item', () => {
    mockUseMarketplaceInstallCapability.mockReturnValue(true);

    renderWithProviders(
      <MarketplaceItemCard item={makeItem({ installable: false })} />,
    );

    expect(screen.getByText('Platform managed')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^install$/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the platform managed status for a platform managed fixture', () => {
    mockUseMarketplaceInstallCapability.mockReturnValue(true);

    renderWithProviders(
      <MarketplaceItemCard
        item={makeItem({ id: 'phoenix', name: 'Phoenix' })}
      />,
    );

    expect(screen.getByText('Platform managed')).toBeInTheDocument();
  });

  it('gives the status a focusable trigger rather than a disabled control', () => {
    mockUseMarketplaceInstallCapability.mockReturnValue(true);

    renderWithProviders(
      <MarketplaceItemCard item={makeItem({ status: 'installed' })} />,
    );

    const trigger = screen.getByText('Installed').closest('[tabindex="0"]');
    expect(trigger).not.toBeNull();
    expect(trigger).not.toBeDisabled();
  });

  it('opens the install dialog from the Install button', async () => {
    mockUseMarketplaceInstallCapability.mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);
    await user.click(screen.getByRole('button', { name: /^install$/i }));

    await waitFor(() => {
      expect(screen.getByText('Install Test Item')).toBeInTheDocument();
    });
  });
});

describe('MarketplaceItemCard background install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseMarketplaceInstallCapability.mockReturnValue(true);
    mockUseInstallMarketplaceItem.mockReturnValue({
      mutateAsync: mockMutateAsync,
    } as unknown as ReturnType<typeof useInstallMarketplaceItem>);
  });

  function seedRecord(itemId: string, record: Record<string, unknown>) {
    localStorage.setItem(
      'marketplace-install-records',
      JSON.stringify({ [`test-namespace/${itemId}`]: record }),
    );
  }

  it('shows a live Installing state for an in-flight item', () => {
    seedRecord('test-item', {
      state: 'installing',
      startedAt: new Date().toISOString(),
      itemName: 'Test Item',
    });

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    expect(screen.getByText('Installing…')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^install$/i }),
    ).not.toBeInTheDocument();
  });

  it('disables Install on other items while one is installing', async () => {
    seedRecord('other-item', {
      state: 'installing',
      startedAt: new Date().toISOString(),
      itemName: 'Other Item',
    });

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    const installButton = screen.getByRole('button', { name: /^install$/i });
    expect(installButton).toBeDisabled();

    await userEvent.hover(installButton.parentElement as HTMLElement);
    await waitFor(() => {
      expect(
        screen.getAllByText(/installing other item/i).length,
      ).toBeGreaterThan(0);
    });
  });

  it('surfaces a timed-out install distinctly from a failure', () => {
    seedRecord('test-item', {
      state: 'timed-out',
      startedAt: new Date().toISOString(),
      itemName: 'Test Item',
    });

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    expect(screen.getByText('Timed out')).toBeInTheDocument();
  });
});

describe('MarketplaceItemCard read-only mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseInstallMarketplaceItem.mockReturnValue({
      mutateAsync: mockMutateAsync,
    } as unknown as ReturnType<typeof useInstallMarketplaceItem>);
  });

  afterEach(() => {
    namespaceState.readOnlyMode = false;
  });

  it('disables Install for a user without write access', () => {
    namespaceState.readOnlyMode = true;
    mockUseMarketplaceInstallCapability.mockReturnValue(true);

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    expect(screen.getByRole('button', { name: /^install$/i })).toBeDisabled();
  });

  it('disables the legacy Get button too, and refuses the handler', async () => {
    namespaceState.readOnlyMode = true;
    mockUseMarketplaceInstallCapability.mockReturnValue(false);

    renderWithProviders(<MarketplaceItemCard item={makeItem()} />);

    const getButton = screen.getByRole('button', { name: /get/i });
    expect(getButton).toBeDisabled();

    // Driving it programmatically must not reach the mutation either.
    getButton.click();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });
});
