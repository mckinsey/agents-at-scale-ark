import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storedQueryTimeoutSettingAtom } from '@/atoms/experimental-features';
import { QueriesSettings } from '@/components/settings/queries-settings';
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
    info: vi.fn(),
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

const renderWithStore = (store: ReturnType<typeof createStore>) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Provider store={store}>
        <QueriesSettings />
      </Provider>
    </QueryClientProvider>,
  );
};

describe('QueriesSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.localStorage.clear();
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

  it('saves the query timeout to the stored atom', async () => {
    vi.mocked(arkConfigService.get).mockResolvedValue({
      queryTTL: null,
      exists: false,
    });
    vi.mocked(arkConfigService.update).mockResolvedValue({
      queryTTL: null,
      exists: true,
    });

    const store = createStore();
    renderWithStore(store);

    await waitFor(() => {
      expect(screen.getByLabelText(/query timeout/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/query timeout/i), {
      target: { value: '7' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(store.get(storedQueryTimeoutSettingAtom)).toBe('7m');
    });
  });

  it('rejects a non-positive query timeout before saving', async () => {
    vi.mocked(arkConfigService.get).mockResolvedValue({
      queryTTL: null,
      exists: false,
    });

    const store = createStore();
    renderWithStore(store);

    await waitFor(() => {
      expect(screen.getByLabelText(/query timeout/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/query timeout/i), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/greater than zero/i);
    expect(arkConfigService.update).not.toHaveBeenCalled();
    expect(store.get(storedQueryTimeoutSettingAtom)).not.toBe('0m');
  });
});
