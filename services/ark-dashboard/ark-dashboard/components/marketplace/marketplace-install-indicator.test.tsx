import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Sidebar,
  SidebarFooter,
  SidebarMenu,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { useMarketplaceInstallCapability } from '@/lib/hooks/use-marketplace-install-capability';

import { MarketplaceInstallIndicator } from './marketplace-install-indicator';

/** It renders as a SidebarMenuButton, so it only works inside a sidebar. */
function renderInSidebar() {
  return render(
    <SidebarProvider>
      <Sidebar>
        <SidebarFooter>
          <SidebarMenu>
            <MarketplaceInstallIndicator />
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>,
  );
}

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));
vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/hooks/use-marketplace-install-capability');

const mockCapability = vi.mocked(useMarketplaceInstallCapability);

function seedRecord(itemId: string, record: Record<string, unknown>) {
  localStorage.setItem(
    'marketplace-install-records',
    JSON.stringify({ [`test-namespace/${itemId}`]: record }),
  );
}

function seedInstalling(itemId: string, itemName: string) {
  seedRecord(itemId, {
    state: 'installing',
    startedAt: new Date().toISOString(),
    itemName,
  });
}

function storedRecord(itemId: string): Record<string, unknown> {
  const stored = JSON.parse(
    localStorage.getItem('marketplace-install-records') ?? '{}',
  );
  return stored[`test-namespace/${itemId}`] ?? {};
}

describe('MarketplaceInstallIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockCapability.mockReturnValue(true);
  });

  it('renders nothing when no install is in flight', () => {
    renderInSidebar();
    expect(
      screen.queryByRole('button', { name: /installing/i }),
    ).not.toBeInTheDocument();
  });

  it('renders nothing when the capability is off, even mid-install', () => {
    mockCapability.mockReturnValue(false);
    seedInstalling('a2a-inspector', 'A2A Inspector');

    renderInSidebar();
    expect(
      screen.queryByRole('button', { name: /installing/i }),
    ).not.toBeInTheDocument();
  });

  it('names the running install so it is reachable from any page', () => {
    seedInstalling('a2a-inspector', 'A2A Inspector');

    renderInSidebar();

    expect(
      screen.getByRole('button', { name: /installing a2a inspector/i }),
    ).toBeInTheDocument();
  });

  it('opens a popover with the live stage list', async () => {
    seedInstalling('a2a-inspector', 'A2A Inspector');

    renderInSidebar();
    await userEvent.click(
      screen.getByRole('button', { name: /installing a2a inspector/i }),
    );

    // Every stage is listed, not just the current one.
    expect(screen.getByText('Creating resources')).toBeInTheDocument();
    expect(
      screen.getByText('Waiting for resources to become ready'),
    ).toBeInTheDocument();
    // The trigger names the item; only the popover names the stage.
    expect(screen.getAllByText('Resolving chart')).toHaveLength(1);
    expect(
      screen.getByText(
        /resolving chart\. this continues if you navigate away/i,
      ),
    ).toBeInTheDocument();
  });

  it('stays visible after a successful install, showing the outcome', () => {
    seedRecord('a2a-inspector', {
      state: 'installed',
      startedAt: new Date().toISOString(),
      itemName: 'A2A Inspector',
      resources: [{ kind: 'Deployment', name: 'a2a-inspector', state: 'free' }],
    });

    renderInSidebar();

    expect(
      screen.getByRole('button', { name: /installed a2a inspector/i }),
    ).toBeInTheDocument();
  });

  it('stays visible after a failure, and says so', () => {
    seedRecord('ark-sandbox', {
      state: 'failed',
      startedAt: new Date().toISOString(),
      itemName: 'ARK Sandbox',
      failedStage: 'apply',
    });

    renderInSidebar();

    expect(
      screen.getByRole('button', { name: /install failed ark sandbox/i }),
    ).toBeInTheDocument();
  });

  it('opens the result dialog on click, and retires only once it is closed', async () => {
    seedRecord('a2a-inspector', {
      state: 'installed',
      startedAt: new Date().toISOString(),
      itemName: 'A2A Inspector',
      resources: [{ kind: 'Deployment', name: 'a2a-inspector', state: 'free' }],
    });

    renderInSidebar();
    await userEvent.click(
      screen.getByRole('button', { name: /installed a2a inspector/i }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('A2A Inspector installed')).toBeInTheDocument();
    // Still unacknowledged while the dialog is open.
    expect(storedRecord('a2a-inspector').acknowledged).toBeUndefined();

    // The dialog ships its own X alongside the footer Close.
    const [footerClose] = screen.getAllByRole('button', { name: /^close$/i });
    await userEvent.click(footerClose);

    expect(storedRecord('a2a-inspector').acknowledged).toBe(true);
    expect(
      screen.queryByRole('button', { name: /installed a2a inspector/i }),
    ).not.toBeInTheDocument();
  });

  it('does not resurface an install the user has already seen', () => {
    seedRecord('a2a-inspector', {
      state: 'installed',
      startedAt: new Date().toISOString(),
      itemName: 'A2A Inspector',
      acknowledged: true,
    });

    renderInSidebar();

    expect(
      screen.queryByRole('button', { name: /installed/i }),
    ).not.toBeInTheDocument();
  });

  it('shows a failed result without a studio link table', async () => {
    seedRecord('ark-sandbox', {
      state: 'timed-out',
      startedAt: new Date().toISOString(),
      itemName: 'ARK Sandbox',
    });

    renderInSidebar();
    await userEvent.click(
      screen.getByRole('button', { name: /install timed out ark sandbox/i }),
    );

    expect(screen.getByText(/did not finish in time/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
