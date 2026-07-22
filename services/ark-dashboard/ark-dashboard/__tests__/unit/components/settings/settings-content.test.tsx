import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SettingsContent } from '@/components/settings/settings-content';

vi.mock('@/components/settings/queries-settings', () => ({
  QueriesSettings: () => <div>queries-settings-stub</div>,
}));
vi.mock('@/components/settings/experimental-features-settings', () => ({
  ExperimentalFeaturesSettings: () => <div>experimental-settings-stub</div>,
}));
vi.mock('@/components/settings/execution-engines-settings', () => ({
  ExecutionEnginesSettings: () => <div>execution-engines-stub</div>,
}));
vi.mock('@/components/settings/manage-marketplace-settings', () => ({
  ManageMarketplaceSettings: () => <div>manage-marketplace-stub</div>,
}));

describe('SettingsContent', () => {
  it('routes the manage-marketplace page to ManageMarketplaceSettings', () => {
    render(<SettingsContent activePage="manage-marketplace" />);
    expect(
      screen.getByRole('heading', { name: 'Manage marketplace' }),
    ).toBeInTheDocument();
    expect(screen.getByText('manage-marketplace-stub')).toBeInTheDocument();
  });

  it('routes the queries page to QueriesSettings', () => {
    render(<SettingsContent activePage="queries" />);
    expect(screen.getByText('queries-settings-stub')).toBeInTheDocument();
    expect(
      screen.queryByText('manage-marketplace-stub'),
    ).not.toBeInTheDocument();
  });
});
