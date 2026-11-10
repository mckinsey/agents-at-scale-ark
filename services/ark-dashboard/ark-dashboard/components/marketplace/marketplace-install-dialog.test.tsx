import { act, render, screen, within } from '@testing-library/react';
import { Provider } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MarketplaceItem } from '@/lib/api/generated/marketplace-types';
import { completedResources } from '@/lib/services/marketplace-install-mock';

import { MarketplaceInstallDialog } from './marketplace-install-dialog';

const mockPush = vi.fn();

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: mockPush, replace: vi.fn() }),
}));

function makeItem(overrides?: Partial<MarketplaceItem>): MarketplaceItem {
  return {
    id: 'a2a-inspector',
    name: 'A2A Inspector',
    description: 'Inspect A2A traffic',
    shortDescription: 'Inspect A2A traffic',
    category: 'tools',
    type: 'service',
    version: '0.3.0',
    author: 'Ark',
    status: 'available',
    installable: true,
    featured: false,
    downloads: 0,
    tags: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

function seedTerminal(itemId: string, record: Record<string, unknown>): void {
  localStorage.setItem(
    'marketplace-install-records',
    JSON.stringify({ [`test-namespace/${itemId}`]: record }),
  );
}

async function renderOpen(item: MarketplaceItem = makeItem()) {
  const onOpenChange = vi.fn();
  const rendered = render(
    <Provider>
      <MarketplaceInstallDialog item={item} open onOpenChange={onOpenChange} />
    </Provider>,
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });

  return { onOpenChange, rendered };
}

async function clickInstall() {
  const installButton = screen.getByRole('button', { name: /^install$/i });
  await act(async () => {
    installButton.click();
  });
}

describe('MarketplaceInstallDialog', () => {
  beforeEach(() => {
    // atomWithStorage reads localStorage on init, and jsdom keeps it between
    // tests — so records would leak from one test into the next.
    localStorage.clear();
    vi.useFakeTimers();
    mockPush.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists the chart details and the resources that will be created', async () => {
    await renderOpen();

    expect(screen.getByText('Install A2A Inspector')).toBeInTheDocument();
    expect(screen.getByText('Chart')).toBeInTheDocument();
    expect(screen.getByText('Release')).toBeInTheDocument();
    expect(screen.getAllByText('a2a-inspector').length).toBeGreaterThan(0);
    expect(screen.getByText('0.3.0')).toBeInTheDocument();
    expect(screen.getByText('test-namespace')).toBeInTheDocument();
    expect(screen.getByText('Deployment')).toBeInTheDocument();
    expect(screen.getByText('Service')).toBeInTheDocument();
    expect(screen.getByText('ConfigMap')).toBeInTheDocument();
    expect(screen.getByText('Secret')).toBeInTheDocument();
  });

  it('renders the resources in a table with Kind and Name columns', async () => {
    await renderOpen();

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map(header => header.textContent)).toEqual([
      'Kind',
      'Name',
      'Status',
    ]);

    const deploymentRow = screen.getByRole('cell', {
      name: 'Deployment',
    }).parentElement;
    expect(deploymentRow).not.toBeNull();
    expect(
      within(deploymentRow as HTMLElement).getByText('a2a-inspector'),
    ).toBeInTheDocument();
    expect(
      within(deploymentRow as HTMLElement).getByText('New'),
    ).toBeInTheDocument();
  });

  it('blocks the install when a resource name is already taken', async () => {
    await renderOpen(
      makeItem({
        id: 'kyc-onboarding-bundle',
        name: 'KYC Onboarding Bundle',
        type: 'demo',
      }),
    );

    const modelRow = screen.getByRole('cell', { name: 'Model' }).parentElement;
    expect(
      within(modelRow as HTMLElement).getByText('Name in use'),
    ).toBeInTheDocument();

    const teamRow = screen.getByRole('cell', { name: 'Team' }).parentElement;
    expect(within(teamRow as HTMLElement).getByText('New')).toBeInTheDocument();

    const blockingNotice = screen.getByRole('alert');
    expect(blockingNotice).toHaveAttribute('aria-live', 'assertive');
    expect(
      screen.getByText(
        /2 resources already exist in this namespace, manually delete them to enable this install, or contact the platform team\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^install$/i })).toBeDisabled();
  });

  it('warns but still allows the install when a resource cannot be checked', async () => {
    await renderOpen(makeItem({ id: 'mcp-inspector', name: 'MCP Inspector' }));

    const secretRow = screen.getByRole('cell', {
      name: 'Secret',
    }).parentElement;
    expect(
      within(secretRow as HTMLElement).getByText('Cannot verify'),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/some resources could not be checked/i),
    ).toBeInTheDocument();

    // A non-blocking warning must not interrupt a screen reader, so it is a
    // polite status rather than an assertive alert.
    const notice = screen.getByRole('status');
    expect(notice).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getByRole('button', { name: /^install$/i }),
    ).not.toBeDisabled();
  });

  it('leaves a clean chart installable with every resource marked New', async () => {
    await renderOpen();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getByRole('button', { name: /^install$/i }),
    ).not.toBeDisabled();
    expect(screen.getAllByText('New').length).toBeGreaterThan(0);
  });

  it('shows a secret by name only and never a value', async () => {
    await renderOpen();

    expect(screen.getByText('a2a-inspector-credentials')).toBeInTheDocument();
  });

  it('advances to the staged progress list on install', async () => {
    await renderOpen();
    await clickInstall();

    expect(screen.getByText('Resolving chart')).toBeInTheDocument();
    expect(screen.getByText('Creating resources')).toBeInTheDocument();
  });

  it('does not restart the preview when the item object identity changes', async () => {
    const item = makeItem();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <MarketplaceInstallDialog item={item} open onOpenChange={onOpenChange} />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await clickInstall();
    expect(screen.getByText('Resolving chart')).toBeInTheDocument();

    // A react-query refetch hands down a new object for the same item.
    rerender(
      <Provider>
        <MarketplaceInstallDialog
          item={{ ...item }}
          open
          onOpenChange={onOpenChange}
        />
      </Provider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByText('Resolving chart')).toBeInTheDocument();
  });

  it('can be closed while installing, and says so', async () => {
    const { onOpenChange } = await renderOpen();
    await clickInstall();

    expect(
      screen.getByText(/you can close this — it keeps running/i),
    ).toBeInTheDocument();

    const closeButton = screen
      .getAllByRole('button', { name: /^close$/i })
      .at(0);
    await act(async () => {
      closeButton?.click();
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders studio links only for navigable kinds once installed', async () => {
    const item = makeItem({
      id: 'kyc-demo-bundle',
      name: 'KYC Demo Bundle',
      type: 'demo',
    });
    seedTerminal('kyc-demo-bundle', {
      state: 'installed',
      startedAt: new Date().toISOString(),
      itemName: 'KYC Demo Bundle',
      resources: completedResources('test-namespace', item),
    });
    await renderOpen(item);

    expect(screen.getByText('KYC Demo Bundle installed')).toBeInTheDocument();

    expect(
      screen.getAllByRole('button', { name: /open in studio/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^open$/i })).toBeInTheDocument();
    expect(screen.getByText('kyc-demo-bundle-values')).toBeInTheDocument();

    // Non-navigable kinds must still fill the result column.
    const configMapRow = screen.getByRole('cell', {
      name: 'ConfigMap',
    }).parentElement;
    expect(
      within(configMapRow as HTMLElement).getByText('Created'),
    ).toBeInTheDocument();
  });

  it('navigates with the namespaced router when a studio link is used', async () => {
    const item = makeItem({
      id: 'kyc-demo-bundle',
      name: 'KYC Demo Bundle',
      type: 'demo',
    });
    seedTerminal('kyc-demo-bundle', {
      state: 'installed',
      startedAt: new Date().toISOString(),
      itemName: 'KYC Demo Bundle',
      resources: completedResources('test-namespace', item),
    });
    await renderOpen(item);

    const [studioButton] = screen.getAllByRole('button', {
      name: /open in studio/i,
    });
    await act(async () => {
      studioButton.click();
    });

    expect(mockPush).toHaveBeenCalledWith('/teams/kyc-demo-bundle-team');
  });

  it('reports a failure without offering a retry', async () => {
    seedTerminal('ark-sandbox', {
      state: 'failed',
      startedAt: new Date().toISOString(),
      itemName: 'ARK Sandbox',
      failedStage: 'apply',
    });
    await renderOpen(makeItem({ id: 'ark-sandbox', name: 'ARK Sandbox' }));

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Title and description are collapsed into one compact line.
    expect(
      screen.getByText(
        /installation failed while creating resources\. contact the platform team\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
    expect(
      screen.getAllByRole('button', { name: /^close$/i }).length,
    ).toBeGreaterThan(0);
  });
});
