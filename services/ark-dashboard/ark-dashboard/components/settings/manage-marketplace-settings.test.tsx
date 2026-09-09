import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCreateMarketplaceSource,
  useDeleteMarketplaceSource,
  useMarketplaceCanEdit,
  useMarketplaceSources,
} from '@/lib/services/marketplace-hooks';

import { AddMarketplaceButton } from './add-marketplace-dialog';
import { ManageMarketplaceSettings } from './manage-marketplace-settings';

vi.mock('@/lib/services/marketplace-hooks', () => ({
  useMarketplaceSources: vi.fn(),
  useMarketplaceCanEdit: vi.fn(),
  useCreateMarketplaceSource: vi.fn(),
  useDeleteMarketplaceSource: vi.fn(),
}));

const SOURCES = [
  {
    name: 'agents-at-scale-marketplace',
    url: 'https://x.test/marketplace.json',
    displayName: 'Ark',
  },
];

const createMutate = vi.fn();
const deleteMutate = vi.fn();

function setup({ canEdit }: { canEdit: boolean }) {
  vi.mocked(useMarketplaceSources).mockReturnValue({
    data: SOURCES,
    isPending: false,
  } as never);
  vi.mocked(useMarketplaceCanEdit).mockReturnValue({
    data: { canEdit },
  } as never);
  vi.mocked(useCreateMarketplaceSource).mockReturnValue({
    mutate: createMutate,
    isPending: false,
  } as never);
  vi.mocked(useDeleteMarketplaceSource).mockReturnValue({
    mutate: deleteMutate,
    isPending: false,
  } as never);
}

// The create form lives in the header dialog; the list renders beside it.
function renderPage() {
  return render(
    <>
      <AddMarketplaceButton />
      <ManageMarketplaceSettings />
    </>,
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', { name: /add new marketplace/i }),
  );
}

async function fillAdoPreset(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^azure devops$/i }));
  await user.type(screen.getByLabelText(/organization/i), 'my-org');
  await user.type(screen.getByLabelText(/^project$/i), 'my-project');
  await user.type(screen.getByLabelText(/repository/i), 'my-repo');
}

describe('ManageMarketplaceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders read-only when canEdit is false', () => {
    setup({ canEdit: false });
    renderPage();

    expect(screen.getByText('Ark')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /add new marketplace/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^delete/i }),
    ).not.toBeInTheDocument();
  });

  it('renders editable controls and creates a source when canEdit is true', async () => {
    setup({ canEdit: true });
    const user = userEvent.setup();
    renderPage();

    const addButton = screen.getByRole('button', {
      name: /add new marketplace/i,
    });
    expect(addButton).toBeInTheDocument();
    await user.click(addButton);

    await user.type(
      screen.getByLabelText('Marketplace JSON URL'),
      'https://new.test/marketplace.json',
    );
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const body = createMutate.mock.calls[0][0];
    expect(body.url).toBe('https://new.test/marketplace.json');
    expect(body.name).toMatch(/^[-._a-z0-9]+$/);
  });

  it('accepts a manifest URL not named marketplace.json', async () => {
    setup({ canEdit: true });
    const user = userEvent.setup();
    renderPage();

    await openDialog(user);
    await user.type(
      screen.getByLabelText('Marketplace JSON URL'),
      'https://new.test/agents.json',
    );
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0].url).toBe(
      'https://new.test/agents.json',
    );
  });

  it('deletes a source when canEdit is true', async () => {
    setup({ canEdit: true });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Delete Ark' }));

    expect(deleteMutate).toHaveBeenCalledWith('agents-at-scale-marketplace');
  });

  it('blocks an authenticated source with no credential', async () => {
    setup({ canEdit: true });
    const user = userEvent.setup();
    renderPage();

    await openDialog(user);
    await fillAdoPreset(user);
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/credential is required/i)).toBeInTheDocument();
  });

  it('builds and submits an Azure DevOps URL from the preset fields', async () => {
    setup({ canEdit: true });
    const user = userEvent.setup();
    renderPage();

    await openDialog(user);
    await fillAdoPreset(user);
    await user.type(screen.getByLabelText('Token'), 'pat-123');

    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const body = createMutate.mock.calls[0][0];
    expect(body.url).toBe(
      'https://dev.azure.com/my-org/my-project/_apis/git/repositories/my-repo/items' +
        '?path=/marketplace.json&api-version=7.1&$format=text' +
        '&versionDescriptor.version=main&versionDescriptor.versionType=branch',
    );
    expect(body.auth).toEqual({ scheme: 'basic', credential: 'pat-123' });
  });

  it('blocks submission of an incomplete Azure DevOps preset', async () => {
    setup({ canEdit: true });
    const user = userEvent.setup();
    renderPage();

    await openDialog(user);
    await user.click(screen.getByRole('button', { name: /^azure devops$/i }));
    await user.type(screen.getByLabelText(/organization/i), 'my-org');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(createMutate).not.toHaveBeenCalled();
  });

  it('shows a credential badge without revealing the stored value', () => {
    vi.mocked(useMarketplaceSources).mockReturnValue({
      data: [
        {
          name: 'priv',
          url: 'https://priv.test/marketplace.json',
          displayName: 'Private',
          auth: { scheme: 'bearer' },
          hasCredential: true,
        },
      ],
      isPending: false,
    } as never);
    vi.mocked(useMarketplaceCanEdit).mockReturnValue({
      data: { canEdit: true },
    } as never);
    vi.mocked(useCreateMarketplaceSource).mockReturnValue({
      mutate: createMutate,
      isPending: false,
    } as never);
    vi.mocked(useDeleteMarketplaceSource).mockReturnValue({
      mutate: deleteMutate,
      isPending: false,
    } as never);

    renderPage();
    expect(screen.getByText('Bearer')).toBeInTheDocument();
    // No password/token input is rendered for an existing source (no edit form).
    expect(
      screen.queryByPlaceholderText(/sent once on save/i),
    ).not.toBeInTheDocument();
  });
});
