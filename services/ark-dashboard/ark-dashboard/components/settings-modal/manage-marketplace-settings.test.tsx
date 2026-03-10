import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider } from 'jotai';
import { toast } from 'sonner';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ManageMarketplaceSettings } from './manage-marketplace-settings';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockToast = vi.mocked(toast);
const mockFetch = vi.fn();

function mockValidateSuccess() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ valid: true, itemCount: 1 }),
  });
}

function mockValidateFailure(error: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ valid: false, error }),
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return { queryClient, ...render(
    <QueryClientProvider client={queryClient}>
      <JotaiProvider>{ui}</JotaiProvider>
    </QueryClientProvider>
  ) };
}

describe('ManageMarketplaceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    localStorage.clear();
    localStorage.setItem('marketplace-sources', JSON.stringify([
      {
        id: 'default',
        name: 'ARK marketplace',
        url: 'https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json',
        displayName: 'ARK marketplace',
        enabled: true,
      },
    ]));
  });

  it('should render marketplace sources', () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    expect(screen.getByText('Marketplace Sources')).toBeInTheDocument();
    expect(screen.getByText('ARK marketplace')).toBeInTheDocument();
  });

  it('should not render a Save button', () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('should not render an enable/disable toggle for sources', () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('should render refresh data button', () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    expect(screen.getByRole('button', { name: /Refresh Data/i })).toBeInTheDocument();
  });

  it('should refresh marketplace data when refresh button is clicked', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    await userEvent.click(screen.getByRole('button', { name: /Refresh Data/i }));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Marketplace data refreshed');
    });
  });

  it('should show add marketplace form when add button is clicked', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    expect(screen.queryByPlaceholderText(/https:\/\/raw\.githubusercontent\.com/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Add new marketplace/i }));

    expect(screen.getByPlaceholderText(/https:\/\/raw\.githubusercontent\.com/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Marketplace JSON URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Display name/i)).toBeInTheDocument();
  });

  it('should add a new marketplace source immediately without a save step', async () => {
    mockValidateSuccess();
    renderWithProviders(<ManageMarketplaceSettings />);

    await userEvent.click(screen.getByRole('button', { name: /Add new marketplace/i }));

    await userEvent.type(
      screen.getByPlaceholderText(/https:\/\/raw\.githubusercontent\.com/i),
      'https://example.com/marketplace.json'
    );
    await userEvent.type(screen.getByLabelText(/Display name/i), 'Custom Marketplace');

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByText('Custom Marketplace')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });
  });

  it('should show error when trying to add source without URL', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    await userEvent.click(screen.getByRole('button', { name: /Add new marketplace/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByText('Marketplace URL is required')).toBeInTheDocument();
    });
  });

  it('should reject HTTP URLs with a validation error', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    await userEvent.click(screen.getByRole('button', { name: /Add new marketplace/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/https:\/\/raw\.githubusercontent\.com/i),
      'http://example.com/marketplace.json'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByText('Only HTTPS URLs are allowed')).toBeInTheDocument();
    });
  });

  it('should reject URLs that do not point to a marketplace.json file', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    await userEvent.click(screen.getByRole('button', { name: /Add new marketplace/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/https:\/\/raw\.githubusercontent\.com/i),
      'https://example.com/other-file.json'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByText('URL must point to a marketplace.json file')).toBeInTheDocument();
    });
  });

  it('should accept a valid HTTPS marketplace.json URL', async () => {
    mockValidateSuccess();
    renderWithProviders(<ManageMarketplaceSettings />);

    await userEvent.click(screen.getByRole('button', { name: /Add new marketplace/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/https:\/\/raw\.githubusercontent\.com/i),
      'https://example.com/marketplace.json'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.queryByText(/Only HTTPS URLs are allowed/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/must point to a marketplace.json/i)).not.toBeInTheDocument();
    });
  });

  it('should show schema error with reference link when URL does not match marketplace schema', async () => {
    mockValidateFailure('JSON does not match the marketplace schema');
    renderWithProviders(<ManageMarketplaceSettings />);

    await userEvent.click(screen.getByRole('button', { name: /Add new marketplace/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/https:\/\/raw\.githubusercontent\.com/i),
      'https://example.com/marketplace.json'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByText('JSON does not match the marketplace schema')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /See the public marketplace\.json/i })).toBeInTheDocument();
    });
  });

  it('should show fetch error with reference link when URL cannot be fetched', async () => {
    mockValidateFailure('Could not fetch the URL (HTTP 404)');
    renderWithProviders(<ManageMarketplaceSettings />);

    await userEvent.click(screen.getByRole('button', { name: /Add new marketplace/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/https:\/\/raw\.githubusercontent\.com/i),
      'https://example.com/marketplace.json'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByText('Could not fetch the URL (HTTP 404)')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /See the public marketplace\.json/i })).toBeInTheDocument();
    });
  });

  it('should cancel adding a new source', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    await userEvent.click(screen.getByRole('button', { name: /Add new marketplace/i }));

    expect(screen.getByPlaceholderText(/https:\/\/raw\.githubusercontent\.com/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/https:\/\/raw\.githubusercontent\.com/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Add new marketplace/i })).toBeInTheDocument();
    });
  });

  it('should not show delete button for default marketplace source', () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    const defaultSection = screen.getByText('ARK marketplace').closest('.rounded-lg');
    const deleteButtons = defaultSection?.querySelectorAll('button[class*="hover:text-destructive"]') || [];

    expect(deleteButtons.length).toBe(0);
  });

  it('should delete a custom marketplace source immediately', async () => {
    localStorage.setItem('marketplace-sources', JSON.stringify([
      {
        id: 'default',
        name: 'ARK marketplace',
        url: 'https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json',
        displayName: 'ARK marketplace',
        enabled: true,
      },
      {
        id: 'custom-1',
        name: 'Custom Marketplace',
        url: 'https://example.com/marketplace.json',
        displayName: 'Custom Marketplace',
        enabled: true,
      },
    ]));

    renderWithProviders(<ManageMarketplaceSettings />);

    expect(screen.getByText('Custom Marketplace')).toBeInTheDocument();

    const customSection = screen.getByText('Custom Marketplace').closest('.rounded-lg');
    const deleteButton = customSection?.querySelector('button[class*="hover:text-destructive"]');

    expect(deleteButton).toBeInTheDocument();

    if (deleteButton) {
      await userEvent.click(deleteButton);
    }

    await waitFor(() => {
      expect(screen.queryByText('Custom Marketplace')).not.toBeInTheDocument();
    });
  });

  it('should handle multiple sources with proper display', async () => {
    localStorage.setItem('marketplace-sources', JSON.stringify([
      {
        id: 'default',
        name: 'ARK marketplace',
        url: 'https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json',
        displayName: 'ARK marketplace',
        enabled: true,
      },
      {
        id: 'custom-1',
        name: 'Internal Tools',
        url: 'https://internal.example.com/marketplace.json',
        displayName: 'Internal Tools',
        enabled: true,
      },
      {
        id: 'custom-2',
        name: 'Community Marketplace',
        url: 'https://community.example.com/marketplace.json',
        displayName: 'Community Marketplace',
        enabled: true,
      },
    ]));

    renderWithProviders(<ManageMarketplaceSettings />);

    expect(screen.getByText('ARK marketplace')).toBeInTheDocument();
    expect(screen.getByText('Internal Tools')).toBeInTheDocument();
    expect(screen.getByText('Community Marketplace')).toBeInTheDocument();
  });

  it('should invalidate queries when adding a new source', async () => {
    mockValidateSuccess();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <JotaiProvider>
          <ManageMarketplaceSettings />
        </JotaiProvider>
      </QueryClientProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /Add new marketplace/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/https:\/\/raw\.githubusercontent\.com/i),
      'https://example.com/marketplace.json'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['marketplace'] });
    });
  });

  it('should show both url and display name inputs correctly', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    expect(screen.getByDisplayValue('https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json')).toBeInTheDocument();

    const displayNameInputs = screen.getAllByDisplayValue('ARK marketplace');
    expect(displayNameInputs.length).toBeGreaterThan(0);
  });

  it('should clear url error when user updates the url input', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    await userEvent.click(screen.getByRole('button', { name: /Add new marketplace/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/https:\/\/raw\.githubusercontent\.com/i),
      'http://example.com/marketplace.json'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByText('Only HTTPS URLs are allowed')).toBeInTheDocument();
    });

    const urlInput = screen.getByPlaceholderText(/https:\/\/raw\.githubusercontent\.com/i);
    await userEvent.clear(urlInput);
    await userEvent.type(urlInput, 'https://');

    await waitFor(() => {
      expect(screen.queryByText('Only HTTPS URLs are allowed')).not.toBeInTheDocument();
    });
  });
});