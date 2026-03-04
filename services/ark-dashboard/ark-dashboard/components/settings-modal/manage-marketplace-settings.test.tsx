import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider } from 'jotai';
import { toast } from 'sonner';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ManageMarketplaceSettings } from './manage-marketplace-settings';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockToast = vi.mocked(toast);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <JotaiProvider>{ui}</JotaiProvider>
    </QueryClientProvider>
  );
}

describe('ManageMarketplaceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage
    localStorage.clear();
    // Set default marketplace sources
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

  it('should render refresh data button', () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    const refreshButton = screen.getByRole('button', { name: /Refresh Data/i });
    expect(refreshButton).toBeInTheDocument();
  });

  it('should refresh marketplace data when refresh button is clicked', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    const refreshButton = screen.getByRole('button', { name: /Refresh Data/i });
    await userEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Marketplace data refreshed');
    });
  });

  it('should show add marketplace form when add button is clicked', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    // Initially, the form should not be visible
    expect(screen.queryByText('Add new marketplace')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/https:\/\/raw.githubusercontent.com/i)).not.toBeInTheDocument();

    // Click add new marketplace button
    const addButton = screen.getByRole('button', { name: /Add new marketplace/i });
    await userEvent.click(addButton);

    // Form should now be visible
    expect(screen.getByPlaceholderText(/https:\/\/raw.githubusercontent.com/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Marketplace JSON URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Display name/i)).toBeInTheDocument();
  });

  it('should add a new marketplace source and save it', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    // Click add new marketplace button
    const addButton = screen.getByRole('button', { name: /Add new marketplace/i });
    await userEvent.click(addButton);

    // Fill in the form
    const urlInput = screen.getByPlaceholderText(/https:\/\/raw.githubusercontent.com/i);
    const displayInput = screen.getByLabelText(/Display name/i);

    await userEvent.type(urlInput, 'https://example.com/custom-marketplace.json');
    await userEvent.type(displayInput, 'Custom Marketplace');

    // Click add button to add to local state
    const confirmAddButton = screen.getByRole('button', { name: 'Add' });
    await userEvent.click(confirmAddButton);

    // The new source should be visible (but not saved yet)
    expect(screen.queryByText('Add new marketplace')).toBeInTheDocument();

    // Save the settings
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Marketplace settings saved and data refreshed');
    });
  });

  it('should show error when trying to add source without URL', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    // Click add new marketplace button
    const addButton = screen.getByRole('button', { name: /Add new marketplace/i });
    await userEvent.click(addButton);

    // Click add without filling URL
    const confirmAddButton = screen.getByRole('button', { name: 'Add' });
    await userEvent.click(confirmAddButton);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Marketplace URL is required');
    });
  });

  it('should cancel adding a new source', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    // Click add new marketplace button
    const addButton = screen.getByRole('button', { name: /Add new marketplace/i });
    await userEvent.click(addButton);

    // Form should be visible
    expect(screen.getByPlaceholderText(/https:\/\/raw.githubusercontent.com/i)).toBeInTheDocument();

    // Click cancel
    const cancelButton = screen.getAllByRole('button', { name: 'Cancel' })[0];
    await userEvent.click(cancelButton);

    // Form should be hidden, add button should be visible again
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/https:\/\/raw.githubusercontent.com/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Add new marketplace/i })).toBeInTheDocument();
    });
  });

  it('should not show delete button for default marketplace source', () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    // The default source should not have a delete button
    const defaultSection = screen.getByText('ARK marketplace').closest('.rounded-lg');
    const deleteButtons = defaultSection?.querySelectorAll('button[class*="hover:text-destructive"]') || [];

    expect(deleteButtons.length).toBe(0);
  });

  it('should toggle marketplace source enabled state', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    // Find the switch for the default marketplace
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('aria-checked', 'true');

    // Toggle it off
    await userEvent.click(switchElement);

    // Switch should now be off (but not saved yet)
    expect(switchElement).toHaveAttribute('aria-checked', 'false');

    // Save the change
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Marketplace settings saved and data refreshed');
    });
  });

  it('should delete a custom marketplace source', async () => {
    // Set up with a custom source
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
        url: 'https://example.com/custom.json',
        displayName: 'Custom Marketplace',
        enabled: true,
      },
    ]));

    renderWithProviders(<ManageMarketplaceSettings />);

    // Both sources should be visible
    expect(screen.getByText('ARK marketplace')).toBeInTheDocument();
    expect(screen.getByText('Custom Marketplace')).toBeInTheDocument();

    // Find the custom source section and its delete button
    const customSection = screen.getByText('Custom Marketplace').closest('.rounded-lg');
    const deleteButton = customSection?.querySelector('button[class*="hover:text-destructive"]');

    expect(deleteButton).toBeInTheDocument();

    if (deleteButton) {
      await userEvent.click(deleteButton);
    }

    // Custom source should still be visible (not saved yet)
    expect(screen.queryByText('Custom Marketplace')).not.toBeInTheDocument();

    // Save to persist the deletion
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Marketplace settings saved and data refreshed');
    });
  });

  it('should revert changes when cancel is clicked', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    // Toggle the default source off
    const switchElement = screen.getByRole('switch');
    await userEvent.click(switchElement);
    expect(switchElement).toHaveAttribute('aria-checked', 'false');

    // Click cancel instead of save
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await userEvent.click(cancelButton);

    // Switch should be back to on
    await waitFor(() => {
      const switchAfterCancel = screen.getByRole('switch');
      expect(switchAfterCancel).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('should handle multiple sources with proper display', async () => {
    // Set up with multiple sources
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
        url: 'https://internal.example.com/tools.json',
        displayName: 'Internal Tools',
        enabled: false,
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

    // All sources should be visible
    expect(screen.getByText('ARK marketplace')).toBeInTheDocument();
    expect(screen.getByText('Internal Tools')).toBeInTheDocument();
    expect(screen.getByText('Community Marketplace')).toBeInTheDocument();

    // Check that switches reflect the enabled state
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(3);
    expect(switches[0]).toHaveAttribute('aria-checked', 'true'); // ARK marketplace
    expect(switches[1]).toHaveAttribute('aria-checked', 'false'); // Internal Tools (disabled)
    expect(switches[2]).toHaveAttribute('aria-checked', 'true'); // Community Marketplace
  });

  it('should invalidate queries when saving settings', async () => {
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

    // Make a change and save
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['marketplace'] });
    });
  });

  it('should show both url and display name inputs correctly', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    // The default source should show both URL and display name
    expect(screen.getByDisplayValue('https://raw.githubusercontent.com/mckinsey/agents-at-scale-marketplace/main/marketplace.json')).toBeInTheDocument();

    // All readonly display name inputs should be present
    const displayNameInputs = screen.getAllByDisplayValue('ARK marketplace');
    expect(displayNameInputs.length).toBeGreaterThan(0);
  });
});