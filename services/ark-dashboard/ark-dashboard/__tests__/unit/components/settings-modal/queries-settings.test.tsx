import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QueriesSettings } from '@/components/settings-modal/queries-settings';
import { arkConfigService } from '@/lib/services/arkconfig';

vi.mock('@/lib/services/arkconfig', () => ({
  arkConfigService: {
    get: vi.fn(),
    update: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const renderWithClient = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <QueriesSettings />
    </QueryClientProvider>,
  );
};

describe('QueriesSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders current queryTTL from the API', async () => {
    vi.mocked(arkConfigService.get).mockResolvedValue({
      queryTTL: '720h',
      exists: true,
    });

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByLabelText(/query ttl/i)).toHaveValue('720h');
    });
  });

  it('validates bad duration input before calling the API', async () => {
    vi.mocked(arkConfigService.get).mockResolvedValue({
      queryTTL: null,
      exists: false,
    });

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByLabelText(/query ttl/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/query ttl/i), {
      target: { value: '7 days' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/go duration/i);
    expect(arkConfigService.update).not.toHaveBeenCalled();
  });

  it('saves a valid duration via the update API', async () => {
    vi.mocked(arkConfigService.get).mockResolvedValue({
      queryTTL: null,
      exists: false,
    });
    vi.mocked(arkConfigService.update).mockResolvedValue({
      queryTTL: '240h',
      exists: true,
    });

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByLabelText(/query ttl/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/query ttl/i), {
      target: { value: '240h' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(arkConfigService.update).toHaveBeenCalledWith({
        queryTTL: '240h',
      });
    });
  });

  it('reset button is disabled when no ArkConfig exists', async () => {
    vi.mocked(arkConfigService.get).mockResolvedValue({
      queryTTL: null,
      exists: false,
    });

    renderWithClient();

    const resetButton = await screen.findByRole('button', {
      name: /reset to default/i,
    });
    expect(resetButton).toBeDisabled();
  });
});
