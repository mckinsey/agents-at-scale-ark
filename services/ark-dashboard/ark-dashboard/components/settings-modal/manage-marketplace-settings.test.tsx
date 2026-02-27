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
        name: 'Default Marketplace',
        url: 'https://example.com/marketplace.json',
        displayName: 'Default',
        enabled: true,
      },
    ]));
  });

  it('should render marketplace sources', () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    expect(screen.getByText('Marketplace Sources')).toBeInTheDocument();
    expect(screen.getByText('Default Marketplace')).toBeInTheDocument();
  });

  it('should render refresh data button', () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    const refreshButton = screen.getByRole('button', { name: /Refresh Data/i });
    expect(refreshButton).toBeInTheDocument();
  });

  it('should refresh marketplace data when refresh button is clicked', async () => {
    const { container } = renderWithProviders(<ManageMarketplaceSettings />);

    const refreshButton = screen.getByRole('button', { name: /Refresh Data/i });
    await userEvent.click(refreshButton);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Marketplace data refreshed');
    });
  });

  it('should add a new marketplace source', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    // Click add new marketplace button
    const addButton = screen.getByRole('button', { name: /Add new marketplace/i });
    await userEvent.click(addButton);

    // Fill in the form - use getByLabelText for more specific targeting
    const urlInput = screen.getByPlaceholderText(/https:\/\/raw.githubusercontent.com/i);
    const displayInputs = screen.getAllByPlaceholderText(/e.g., ARK marketplace/i);
    // The last one should be the new form input (not the readonly ones)
    const displayInput = displayInputs[displayInputs.length - 1];

    await userEvent.type(urlInput, 'https://example.com/custom.json');
    await userEvent.type(displayInput, 'Custom Marketplace');

    // Click add button
    const confirmAddButton = screen.getByRole('button', { name: 'Add' });
    await userEvent.click(confirmAddButton);

    // Save the settings
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Marketplace settings saved and data refreshed');
    });
  });

  it('should not allow deleting the default marketplace source', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    // The default source should not have a delete button
    const defaultSection = screen.getByText('Default Marketplace').closest('.rounded-lg');
    const deleteButtons = defaultSection?.querySelectorAll('button[class*="hover:text-destructive"]') || [];

    expect(deleteButtons.length).toBe(0);
  });

  it('should toggle marketplace source enabled state', async () => {
    renderWithProviders(<ManageMarketplaceSettings />);

    // Find the switch for the default marketplace
    const switchElement = screen.getByRole('switch');

    // Toggle it off
    await userEvent.click(switchElement);

    // Save
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalled();
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

  it('should delete a custom marketplace source', async () => {
    // Set up with a custom source
    localStorage.setItem('marketplace-sources', JSON.stringify([
      {
        id: 'default',
        name: 'Default Marketplace',
        url: 'https://example.com/marketplace.json',
        displayName: 'Default',
        enabled: true,
      },
      {
        id: 'custom-1',
        name: 'Custom Marketplace',
        url: 'https://example.com/custom.json',
        displayName: 'Custom',
        enabled: true,
      },
    ]));

    renderWithProviders(<ManageMarketplaceSettings />);

    // Find the custom source section
    const customSection = screen.getByText('Custom Marketplace').closest('.rounded-lg');
    const deleteButton = customSection?.querySelector('button[class*="hover:text-destructive"]');

    expect(deleteButton).toBeInTheDocument();

    if (deleteButton) {
      await userEvent.click(deleteButton);
    }

    // Save
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalled();
      // Custom marketplace should be removed
      expect(screen.queryByText('Custom Marketplace')).not.toBeInTheDocument();
    });
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
});