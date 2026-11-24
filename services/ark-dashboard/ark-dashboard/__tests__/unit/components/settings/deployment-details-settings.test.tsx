import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DeploymentDetailsActions,
  DeploymentDetailsSettings,
} from '@/components/settings/deployment-details-settings';
import { TooltipProvider } from '@/components/ui/tooltip';
import { APIError } from '@/lib/api/client';
import {
  type HelmRelease,
  arkServicesService,
} from '@/lib/services/ark-services';

vi.mock('@/lib/services/ark-services', () => ({
  arkServicesService: {
    getAll: vi.fn(),
  },
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

const release = (overrides: Partial<HelmRelease>): HelmRelease => ({
  name: 'ark-api',
  namespace: 'test-namespace',
  chart: 'ark-api-0.1.72',
  chart_version: '0.1.72',
  app_version: '0.1.72',
  revision: 2,
  status: 'deployed',
  updated: '2026-11-04T10:00:00Z',
  ...overrides,
});

const renderPage = () => {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <DeploymentDetailsActions />
        <DeploymentDetailsSettings />
      </TooltipProvider>
    </QueryClientProvider>,
  );
};

describe('DeploymentDetailsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the namespace releases with their Helm health and unreadable ones', async () => {
    vi.mocked(arkServicesService.getAll).mockResolvedValue({
      items: [
        release({}),
        release({ name: 'broken', app_version: '', status: 'failed' }),
        release({ name: 'upgrading', status: 'pending_upgrade' }),
        release({ name: 'odd', status: 'something-new' }),
      ],
      errors: [
        {
          name: 'unreadable',
          message: 'The release data has an unexpected format.',
        },
        {
          name: 'helm-error',
          message: "Helm couldn't return this release's details.",
        },
      ],
    });

    renderPage();

    const healthy = await screen.findByRole('row', { name: /ark-api/ });
    expect(within(healthy).getByText('0.1.72')).toBeInTheDocument();
    expect(within(healthy).getByText('2')).toBeInTheDocument();
    expect(within(healthy).getByText('Healthy')).toBeInTheDocument();
    expect(within(healthy).getByText('Status: deployed')).toBeInTheDocument();

    const failed = screen.getByRole('row', { name: /broken/ });
    expect(within(failed).getByText('—')).toBeInTheDocument();
    expect(within(failed).getByText('Failed')).toBeInTheDocument();
    expect(within(failed).getByText('Status: failed')).toBeInTheDocument();

    expect(
      within(screen.getByRole('row', { name: /upgrading/ })).getByText(
        'Upgrading',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { name: /odd/ })).getByText('Unknown'),
    ).toBeInTheDocument();

    const unreadable = screen.getByRole('alert');
    expect(unreadable).toHaveTextContent("2 releases couldn't be read");
    expect(unreadable).toHaveTextContent(
      'unreadable: The release data has an unexpected format.',
    );
    expect(unreadable).toHaveTextContent(
      "helm-error: Helm couldn't return this release's details.",
    );
    expect(
      screen.queryByRole('row', { name: /unreadable/ }),
    ).not.toBeInTheDocument();

    expect(screen.getByRole('status')).toHaveTextContent(
      'Showing your namespace only.',
    );
    expect(screen.getByText(/Last checked:/)).toBeInTheDocument();
    expect(arkServicesService.getAll).toHaveBeenCalledWith('test-namespace');
  });

  it('refetches the releases on Refresh', async () => {
    vi.mocked(arkServicesService.getAll).mockResolvedValue({
      items: [release({})],
      errors: [],
    });

    renderPage();
    await screen.findByRole('row', { name: /ark-api/ });

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() =>
      expect(arkServicesService.getAll).toHaveBeenCalledTimes(2),
    );
  });

  it('shows an empty message when the namespace has no releases', async () => {
    vi.mocked(arkServicesService.getAll).mockResolvedValue({
      items: [],
      errors: [],
    });

    renderPage();

    expect(
      await screen.findByText(/No Helm releases found in this namespace/),
    ).toBeInTheDocument();
  });

  it('reports a failed load and retries it', async () => {
    vi.mocked(arkServicesService.getAll).mockRejectedValueOnce(
      new APIError(
        "Ark doesn't have permission to read Helm releases in namespace 'test-namespace'.",
        403,
      ),
    );
    vi.mocked(arkServicesService.getAll).mockResolvedValueOnce({
      items: [release({})],
      errors: [],
    });

    renderPage();

    expect(
      await screen.findByText('Failed to load services'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ark doesn't have permission to read Helm releases in namespace 'test-namespace'.",
      ),
    ).toBeInTheDocument();
    expect(arkServicesService.getAll).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByRole('row', { name: /ark-api/ }),
    ).toBeInTheDocument();
  });
});
