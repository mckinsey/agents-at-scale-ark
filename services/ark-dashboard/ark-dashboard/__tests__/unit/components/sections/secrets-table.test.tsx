import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SecretsTable } from '@/components/sections/secrets-table';
import type { ModelListItem } from '@/lib/services/models';
import type { Secret } from '@/lib/services/secrets';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/secrets'),
  useSearchParams: () => new URLSearchParams('namespace=default'),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ namespace: 'default', readOnlyMode: false }),
}));

const PERSONAL_NAME = 'u-0123456789abcdef-openai';

const sharedSecret: Secret = {
  id: 'openai',
  name: 'openai',
  display_name: 'openai',
  scope: 'shared',
  labels: [],
};

const personalSecret: Secret = {
  id: PERSONAL_NAME,
  name: PERSONAL_NAME,
  display_name: 'openai',
  scope: 'personal',
  labels: [],
};

const promotedSecret: Secret = {
  id: 'u-fedcba9876543210-github',
  name: 'u-fedcba9876543210-github',
  display_name: 'github',
  scope: 'shared',
  labels: [],
};

const noModels: ModelListItem[] = [];

function renderTable(secrets: Secret[]) {
  render(
    <SecretsTable secrets={secrets} models={noModels} onDelete={vi.fn()} />,
  );
}

function rowFor(linkName: string, index = 0) {
  const link = screen.getAllByRole('link', {
    name: new RegExp(`^${linkName}( \\(|$)`),
  })[index];
  const row = link.closest('tr');
  if (!row) {
    throw new Error(`no row for ${linkName}`);
  }
  return row;
}

describe('SecretsTable', () => {
  it('has a Scope column with an explanation', () => {
    renderTable([sharedSecret]);

    expect(
      screen.getByRole('columnheader', { name: /Scope/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'About Scope' }),
    ).toBeInTheDocument();
  });

  it('shows a Shared or Personal badge for each secret', () => {
    renderTable([sharedSecret, personalSecret]);

    expect(within(rowFor('openai', 0)).getByText('Shared')).toBeInTheDocument();
    expect(
      within(rowFor('openai', 1)).getByText('Personal'),
    ).toBeInTheDocument();
  });

  it('shows the display name and, when it differs, the real name below it', () => {
    renderTable([personalSecret]);

    const row = rowFor('openai');
    expect(within(row).getByText(PERSONAL_NAME)).toBeInTheDocument();
    expect(within(row).getByText('Kubernetes name:')).toHaveClass('sr-only');
  });

  it('does not repeat the name when the display name is the real name', () => {
    renderTable([sharedSecret]);

    const row = rowFor('openai');
    expect(within(row).getAllByText('openai')).toHaveLength(1);
    expect(within(row).queryByText('Kubernetes name:')).not.toBeInTheDocument();
  });

  it('tells a promoted secret apart from a shared one with the same display name', () => {
    const sharedGithub: Secret = {
      ...sharedSecret,
      id: 'github',
      name: 'github',
      display_name: 'github',
    };
    renderTable([sharedGithub, promotedSecret]);

    expect(screen.getByRole('link', { name: 'github' })).toHaveAttribute(
      'href',
      expect.stringContaining('/secrets/github'),
    );
    expect(
      screen.getByRole('link', { name: 'github (u-fedcba9876543210-github)' }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/secrets/u-fedcba9876543210-github'),
    );
    expect(
      within(rowFor('github', 1)).getByText('u-fedcba9876543210-github'),
    ).toBeInTheDocument();
    expect(within(rowFor('github', 1)).getByText('Shared')).toBeInTheDocument();
  });

  it('counts the models that use the real name, not the display name', () => {
    const model = {
      id: 'm1',
      name: 'gpt',
      secret_refs: [PERSONAL_NAME],
    } as ModelListItem;
    render(
      <SecretsTable
        secrets={[sharedSecret, personalSecret]}
        models={[model]}
        onDelete={vi.fn()}
      />,
    );

    expect(
      within(rowFor('openai', 0)).getByText('0 models'),
    ).toBeInTheDocument();
    expect(
      within(rowFor('openai', 1)).getByText('1 model'),
    ).toBeInTheDocument();
  });

  it('names the real secret in the delete confirmation', async () => {
    const user = userEvent.setup();
    renderTable([personalSecret]);

    await user.click(screen.getByRole('button', { name: 'Delete secret' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(
      `Do you want to delete "openai (${PERSONAL_NAME})" secret?`,
    );
  });
});
