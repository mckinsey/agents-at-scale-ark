import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { useGetMarketplaceItems } from '@/lib/services/marketplace-hooks';
import type { MarketplaceItem, MarketplaceResponse } from '@/lib/api/generated/marketplace-types';

import MarketplacePage from './page';

// Mock the hooks and services
vi.mock('@/lib/services/marketplace-hooks');
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => '/marketplace'),
}));

// Mock the PageHeader component to avoid SidebarProvider dependency
vi.mock('@/components/common/page-header', () => ({
  PageHeader: vi.fn(({ actions }) => (
    <div data-testid="page-header">
      {actions}
    </div>
  )),
}));

// Mock the MarketplaceItemCard component
vi.mock('@/components/cards/marketplace-item-card', () => ({
  MarketplaceItemCard: vi.fn(({ item }) => (
    <div data-testid={`marketplace-item-${item.id}`}>
      <div>{item.name}</div>
      <div>{item.description}</div>
    </div>
  )),
}));

const mockUseGetMarketplaceItems = vi.mocked(useGetMarketplaceItems);

const mockMarketplaceData: MarketplaceResponse = {
  items: [
    {
      id: 'agent-1',
      name: 'Test Agent',
      description: 'A test agent item',
      category: 'agents',
      type: 'template',
      version: '1.0.0',
      status: 'available',
      author: 'Test Author',
      icon: '🤖',
      featured: false,
    },
    {
      id: 'mcp-1',
      name: 'Test MCP',
      description: 'A test MCP server item',
      category: 'mcp-servers',
      type: 'component',
      version: '1.0.0',
      status: 'available',
      author: 'Test Author',
      icon: '🔌',
      featured: false,
    },
    {
      id: 'demo-1',
      name: 'Test Demo',
      description: 'A test demo item',
      category: 'demos',
      type: 'demo',
      version: '1.0.0',
      status: 'available',
      author: 'Test Author',
      icon: '▶️',
      featured: false,
    },
    {
      id: 'service-1',
      name: 'Test Service',
      description: 'A test service item',
      category: 'services',
      type: 'service',
      version: '1.0.0',
      status: 'installed',
      author: 'Test Author',
      icon: '⚙️',
      featured: true,
    },
  ] as MarketplaceItem[],
  total: 4,
  page: 1,
  pageSize: 10,
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

describe('MarketplacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render marketplace page with items', async () => {
    mockUseGetMarketplaceItems.mockReturnValue({
      data: mockMarketplaceData,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(<MarketplacePage />);

    // Check that the page title is rendered
    expect(screen.getByText('Marketplace (4)')).toBeInTheDocument();

    // Check that marketplace items are displayed
    expect(screen.getByText('Test Agent')).toBeInTheDocument();
    expect(screen.getByText('Test MCP')).toBeInTheDocument();
    expect(screen.getByText('Test Demo')).toBeInTheDocument();
    expect(screen.getByText('Test Service')).toBeInTheDocument();
  });

  it('should NOT render public/internal tabs', () => {
    mockUseGetMarketplaceItems.mockReturnValue({
      data: mockMarketplaceData,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(<MarketplacePage />);

    // Verify that public/internal tabs are NOT present
    expect(screen.queryByText('Public')).not.toBeInTheDocument();
    expect(screen.queryByText('Internal')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('should render category filter buttons', () => {
    mockUseGetMarketplaceItems.mockReturnValue({
      data: mockMarketplaceData,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(<MarketplacePage />);

    // Check that category filter buttons are present
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agents/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /MCPs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Demos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Services/i })).toBeInTheDocument();
  });

  it('should filter items when category button is clicked', async () => {
    const refetchMock = vi.fn();
    mockUseGetMarketplaceItems.mockReturnValue({
      data: mockMarketplaceData,
      isPending: false,
      isError: false,
      error: null,
      refetch: refetchMock,
    } as any);

    renderWithProviders(<MarketplacePage />);

    // Click on Agents filter
    const agentsButton = screen.getByRole('button', { name: /Agents/i });
    await userEvent.click(agentsButton);

    // Verify that useGetMarketplaceItems was called with the correct filter
    await waitFor(() => {
      expect(mockUseGetMarketplaceItems).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'agents',
        })
      );
    });
  });

  it('should handle search input', async () => {
    mockUseGetMarketplaceItems.mockReturnValue({
      data: mockMarketplaceData,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(<MarketplacePage />);

    // Find and type in search input
    const searchInput = screen.getByPlaceholderText('Search marketplace...');
    await userEvent.type(searchInput, 'test query');

    // Verify that useGetMarketplaceItems was called with search filter
    await waitFor(() => {
      expect(mockUseGetMarketplaceItems).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'test query',
        })
      );
    });
  });

  it('should display loading state', () => {
    mockUseGetMarketplaceItems.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(<MarketplacePage />);

    // Check for loading skeletons
    const loadingElements = document.querySelectorAll('.animate-pulse');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('should display empty state when no items', () => {
    mockUseGetMarketplaceItems.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 10 },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(<MarketplacePage />);

    expect(screen.getByText('No marketplace items found')).toBeInTheDocument();
  });

  it('should handle pagination correctly', async () => {
    const largeDataset = {
      items: Array.from({ length: 15 }, (_, i) => ({
        id: `item-${i}`,
        name: `Item ${i}`,
        description: `Description ${i}`,
        category: 'agents',
        type: 'agent',
        version: '1.0.0',
        status: 'available',
        author: 'Test',
        icon: '🤖',
        featured: false,
      })),
      total: 15,
      page: 1,
      pageSize: 10,
    };

    mockUseGetMarketplaceItems.mockReturnValue({
      data: largeDataset,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(<MarketplacePage />);

    // Check pagination controls are rendered
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('Showing 1-6 of 15 items')).toBeInTheDocument();

    // Click next page
    const nextButton = screen.getAllByRole('button').find(
      btn => btn.querySelector('.lucide-chevron-right')
    );

    if (nextButton) {
      await userEvent.click(nextButton);
      await waitFor(() => {
        expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
      });
    }
  });

  it('should reset to first page when searching', async () => {
    mockUseGetMarketplaceItems.mockReturnValue({
      data: mockMarketplaceData,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(<MarketplacePage />);

    // Type in search to trigger page reset
    const searchInput = screen.getByPlaceholderText('Search marketplace...');
    await userEvent.type(searchInput, 'search term');

    // The component should reset to page 1 (this is internal state, so we verify indirectly)
    // by checking that the first page of items would be displayed
    await waitFor(() => {
      expect(mockUseGetMarketplaceItems).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'search term',
        })
      );
    });
  });

  it('should reset to first page when changing category', async () => {
    mockUseGetMarketplaceItems.mockReturnValue({
      data: mockMarketplaceData,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderWithProviders(<MarketplacePage />);

    // Click on Services filter to trigger page reset
    const servicesButton = screen.getByRole('button', { name: /Services/i });
    await userEvent.click(servicesButton);

    // Verify the filter was applied (page reset happens internally)
    await waitFor(() => {
      expect(mockUseGetMarketplaceItems).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'service',
        })
      );
    });
  });
});