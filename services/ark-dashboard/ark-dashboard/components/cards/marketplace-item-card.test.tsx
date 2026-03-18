import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import copy from 'copy-to-clipboard';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { MarketplaceItem } from '@/lib/api/generated/marketplace-types';
import { useInstallMarketplaceItem } from '@/lib/services/marketplace-hooks';

import { MarketplaceItemCard } from './marketplace-item-card';

vi.mock('@/lib/services/marketplace-hooks');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('copy-to-clipboard');

const mockMutateAsync = vi.fn();
const mockUseInstallMarketplaceItem = vi.mocked(useInstallMarketplaceItem);
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
    featured: false,
    downloads: 0,
    tags: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
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
    vi.clearAllMocks();
    mockUseInstallMarketplaceItem.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any);
  });

  it('renders item name and shortDescription', () => {
    renderWithProviders(
      <MarketplaceItemCard item={makeItem()} />,
    );

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

  it('renders up to 4 tags', () => {
    renderWithProviders(
      <MarketplaceItemCard
        item={makeItem({ tags: ['a', 'b', 'c', 'd'] })}
      />,
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

    renderWithProviders(
      <MarketplaceItemCard item={makeItem()} />,
    );

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

    renderWithProviders(
      <MarketplaceItemCard item={makeItem()} />,
    );

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

    renderWithProviders(
      <MarketplaceItemCard item={makeItem()} />,
    );

    await user.click(screen.getByRole('button', { name: /get/i }));

    await waitFor(() => {
      expect(screen.getByText('Installed')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /installed/i })).toBeDisabled();
    expect(toast.success).toHaveBeenCalledWith('Test Item installed successfully');
  });

  it('opens command dialog on command response', async () => {
    mockMutateAsync.mockResolvedValue({
      status: 'command',
      helmCommand: 'helm install test',
      arkCommand: 'ark install test',
    });
    const user = userEvent.setup();

    renderWithProviders(
      <MarketplaceItemCard item={makeItem()} />,
    );

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

    renderWithProviders(
      <MarketplaceItemCard item={makeItem()} />,
    );

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

    renderWithProviders(
      <MarketplaceItemCard item={makeItem()} />,
    );

    await user.click(screen.getByRole('button', { name: /get/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to install Test Item',
        expect.objectContaining({
          description: 'Missing namespace',
        }),
      );
    });
  });

  it('shows error toast with error message when no data details', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    const { toast } = await import('sonner');

    renderWithProviders(
      <MarketplaceItemCard item={makeItem()} />,
    );

    await user.click(screen.getByRole('button', { name: /get/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to install Test Item',
        expect.objectContaining({
          description: 'Network error',
        }),
      );
    });
  });
});

describe('InstallCommandDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseInstallMarketplaceItem.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    } as any);
  });

  async function openDialogWithCommands(
    commands: { helmCommand?: string; arkCommand?: string },
  ) {
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
    const allButtons = Array.from(dialog.querySelectorAll('button')) as HTMLElement[];
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
    expect(screen.getByText('ark marketplace install my-item')).toBeInTheDocument();
    expect(screen.getByText('helm install my-chart')).toBeInTheDocument();
  });

  it('shows kubectl tip', async () => {
    await openDialogWithCommands({ arkCommand: 'ark install test' });

    expect(
      screen.getByText(/Make sure you have kubectl configured/),
    ).toBeInTheDocument();
  });
});
