import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter, useParams } from 'next/navigation';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  useGetMarketplaceItemById,
  useInstallMarketplaceItem,
  useUninstallMarketplaceItem,
} from '@/lib/services/marketplace-hooks';
import type { MarketplaceItemDetail } from '@/lib/api/generated/marketplace-types';

import MarketplaceDetailPage from './page';

vi.mock('@/lib/services/marketplace-hooks');
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => '/marketplace/test-item'),
  useParams: vi.fn(() => ({ id: 'test-item' })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: vi.fn(({ currentPage }) => (
    <div data-testid="page-header">{currentPage}</div>
  )),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockUseGetMarketplaceItemById = vi.mocked(useGetMarketplaceItemById);
const mockUseInstallMarketplaceItem = vi.mocked(useInstallMarketplaceItem);
const mockUseUninstallMarketplaceItem = vi.mocked(useUninstallMarketplaceItem);
const mockPush = vi.fn();

const baseItem: MarketplaceItemDetail = {
  id: 'test-item',
  name: 'Phoenix Observability',
  description: 'Full observability platform',
  shortDescription: 'Observability for AI agents',
  longDescription: 'A detailed description of the observability platform.',
  category: 'observability',
  type: 'service',
  version: '2.1.0',
  author: 'Arize AI',
  status: 'available',
  featured: false,
  downloads: 1500,
  rating: 4.5,
  tags: ['observability', 'tracing'],
  icon: '🔭',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-06-01T00:00:00Z',
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

function setupMocks(overrides?: {
  item?: MarketplaceItemDetail | null;
  isPending?: boolean;
  error?: Error | null;
  installIsPending?: boolean;
  uninstallIsPending?: boolean;
}) {
  const installMutate = vi.fn();
  const uninstallMutate = vi.fn();

  vi.mocked(useRouter).mockReturnValue({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  });

  const itemData = overrides?.item === null ? undefined : (overrides?.item ?? baseItem);

  mockUseGetMarketplaceItemById.mockReturnValue({
    data: itemData,
    isPending: overrides?.isPending ?? false,
    error: overrides?.error ?? null,
  } as any);

  mockUseInstallMarketplaceItem.mockReturnValue({
    mutate: installMutate,
    isPending: overrides?.installIsPending ?? false,
  } as any);

  mockUseUninstallMarketplaceItem.mockReturnValue({
    mutate: uninstallMutate,
    isPending: overrides?.uninstallIsPending ?? false,
  } as any);

  return { installMutate, uninstallMutate };
}

describe('MarketplaceDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders item details', () => {
    setupMocks();

    renderWithProviders(<MarketplaceDetailPage />);

    expect(screen.getByRole('heading', { name: 'Phoenix Observability' })).toBeInTheDocument();
    expect(screen.getByText('Observability for AI agents')).toBeInTheDocument();
    expect(screen.getAllByText('observability').length).toBeGreaterThan(0);
    expect(screen.getByText('service')).toBeInTheDocument();
    expect(screen.getByText('v2.1.0')).toBeInTheDocument();
    expect(screen.getByText('Arize AI')).toBeInTheDocument();
    expect(screen.getByText('1.5k')).toBeInTheDocument();
  });

  it('shows loading skeleton when pending', () => {
    setupMocks({ isPending: true, item: null });

    const { container } = renderWithProviders(<MarketplaceDetailPage />);

    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('shows not-found state when item is undefined', () => {
    setupMocks({ item: null });

    renderWithProviders(<MarketplaceDetailPage />);

    expect(screen.getByText('Item not found')).toBeInTheDocument();
    expect(screen.getByText('Back to Marketplace')).toBeInTheDocument();
  });

  it('triggers toast.error when error is present', async () => {
    const { toast } = await import('sonner');
    const testError = new Error('Network failure');
    setupMocks({ error: testError, item: null });

    renderWithProviders(<MarketplaceDetailPage />);

    expect(toast.error).toHaveBeenCalledWith(
      'Failed to load marketplace item',
      { description: 'Network failure' }
    );
  });

  it('shows install button when status is available and calls mutate on click', async () => {
    const { installMutate } = setupMocks();

    renderWithProviders(<MarketplaceDetailPage />);

    const installButton = screen.getByRole('button', { name: 'Install' });
    expect(installButton).toBeInTheDocument();

    await userEvent.click(installButton);
    expect(installMutate).toHaveBeenCalledWith('test-item');
  });

  it('shows uninstall button and "Currently installed" when status is installed', async () => {
    const installedItem = { ...baseItem, status: 'installed' as const };
    const { uninstallMutate } = setupMocks({ item: installedItem });

    renderWithProviders(<MarketplaceDetailPage />);

    const uninstallButton = screen.getByRole('button', { name: 'Uninstall' });
    expect(uninstallButton).toBeInTheDocument();
    expect(screen.getByText('Currently installed')).toBeInTheDocument();

    await userEvent.click(uninstallButton);
    expect(uninstallMutate).toHaveBeenCalledWith('test-item');
  });

  it('disables install button while install mutation is pending', () => {
    setupMocks({ installIsPending: true });

    renderWithProviders(<MarketplaceDetailPage />);

    const installButton = screen.getByRole('button', { name: 'Install' });
    expect(installButton).toBeDisabled();
  });

  it('renders Overview and Installation tabs', () => {
    setupMocks();

    renderWithProviders(<MarketplaceDetailPage />);

    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Installation' })).toBeInTheDocument();
  });

  it('shows Changelog tab only when item has changelog entries', () => {
    const itemWithChangelog = {
      ...baseItem,
      changelog: [
        { version: '2.1.0', date: '2025-06-01', changes: ['Added tracing support'] },
      ],
    };
    setupMocks({ item: itemWithChangelog });

    renderWithProviders(<MarketplaceDetailPage />);

    expect(screen.getByRole('tab', { name: 'Changelog' })).toBeInTheDocument();
  });

  it('does not show Changelog tab when item has no changelog', () => {
    setupMocks();

    renderWithProviders(<MarketplaceDetailPage />);

    expect(screen.queryByRole('tab', { name: 'Changelog' })).not.toBeInTheDocument();
  });

  it('shows repository link when item.repository exists', () => {
    const itemWithRepo = { ...baseItem, repository: 'https://github.com/example/repo' };
    setupMocks({ item: itemWithRepo });

    renderWithProviders(<MarketplaceDetailPage />);

    expect(screen.getByText('View Repository')).toBeInTheDocument();
  });

  it('shows documentation link when item.documentation exists', () => {
    const itemWithDocs = { ...baseItem, documentation: 'https://docs.example.com' };
    setupMocks({ item: itemWithDocs });

    renderWithProviders(<MarketplaceDetailPage />);

    expect(screen.getByText('Documentation')).toBeInTheDocument();
  });

  it('navigates back to marketplace when back button is clicked', async () => {
    setupMocks();

    renderWithProviders(<MarketplaceDetailPage />);

    const backButton = screen.getByRole('button', { name: /Back/i });
    await userEvent.click(backButton);

    expect(mockPush).toHaveBeenCalledWith('/marketplace');
  });

  it('shows Featured badge when item.featured is true', () => {
    const featuredItem = { ...baseItem, featured: true };
    setupMocks({ item: featuredItem });

    renderWithProviders(<MarketplaceDetailPage />);

    expect(screen.getByText('Featured')).toBeInTheDocument();
  });

  it('does not show Featured badge when item.featured is false', () => {
    setupMocks();

    renderWithProviders(<MarketplaceDetailPage />);

    expect(screen.queryByText('Featured')).not.toBeInTheDocument();
  });

  it('shows checkmark icon when status is installed', () => {
    const installedItem = { ...baseItem, status: 'installed' as const };
    setupMocks({ item: installedItem });

    const { container } = renderWithProviders(<MarketplaceDetailPage />);

    const checkCircle = container.querySelector('[class*="lucide"][class*="check"]');
    expect(checkCircle).toBeInTheDocument();
  });

  it('navigates to marketplace from not-found back button', async () => {
    setupMocks({ item: null });

    renderWithProviders(<MarketplaceDetailPage />);

    const backButton = screen.getByRole('button', { name: /Back to Marketplace/i });
    await userEvent.click(backButton);

    expect(mockPush).toHaveBeenCalledWith('/marketplace');
  });
});
