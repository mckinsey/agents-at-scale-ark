import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ManageMarketplaceSettings } from './manage-marketplace-settings';
import {
  useCreateMarketplaceSource,
  useDeleteMarketplaceSource,
  useMarketplaceCanEdit,
  useMarketplaceSources,
} from '@/lib/services/marketplace-hooks';

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

describe('ManageMarketplaceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders read-only when canEdit is false', () => {
    setup({ canEdit: false });
    render(<ManageMarketplaceSettings />);

    expect(screen.getByText('Ark')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /add new marketplace/i }),
    ).not.toBeInTheDocument();
    // icon-only delete control is absent in read-only mode
    expect(screen.queryByRole('button', { name: '' })).not.toBeInTheDocument();
  });

  it('renders editable controls and creates a source when canEdit is true', async () => {
    setup({ canEdit: true });
    const user = userEvent.setup();
    render(<ManageMarketplaceSettings />);

    const addButton = screen.getByRole('button', { name: /add new marketplace/i });
    expect(addButton).toBeInTheDocument();
    await user.click(addButton);

    const urlInput = screen.getByPlaceholderText(/marketplace\.json/i);
    await user.type(urlInput, 'https://new.test/marketplace.json');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    const body = createMutate.mock.calls[0][0];
    expect(body.url).toBe('https://new.test/marketplace.json');
    expect(body.name).toMatch(/^[-._a-z0-9]+$/);
  });

  it('accepts a manifest URL not named marketplace.json', async () => {
    setup({ canEdit: true });
    const user = userEvent.setup();
    render(<ManageMarketplaceSettings />);

    await user.click(screen.getByRole('button', { name: /add new marketplace/i }));
    const urlInput = screen.getByPlaceholderText(/marketplace\.json/i);
    await user.type(urlInput, 'https://new.test/agents.json');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0].url).toBe('https://new.test/agents.json');
  });

  it('deletes a source when canEdit is true', async () => {
    setup({ canEdit: true });
    const user = userEvent.setup();
    render(<ManageMarketplaceSettings />);

    const deleteButton = screen.getByRole('button', { name: '' });
    await user.click(deleteButton);
    expect(deleteMutate).toHaveBeenCalledWith('agents-at-scale-marketplace');
  });

  it('sends the scheme and credential when adding an authenticated source', async () => {
    setup({ canEdit: true });
    const user = userEvent.setup();
    render(<ManageMarketplaceSettings />);

    await user.click(screen.getByRole('button', { name: /add new marketplace/i }));
    await user.type(
      screen.getByPlaceholderText(/marketplace\.json/i),
      'https://priv.test/marketplace.json',
    );
    await user.click(screen.getByRole('button', { name: /bearer \/ token/i }));
    await user.type(screen.getByPlaceholderText(/sent once on save/i), 'tok-123');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0].auth).toEqual({
      scheme: 'bearer',
      credential: 'tok-123',
    });
  });

  it('blocks an authenticated source with no credential', async () => {
    setup({ canEdit: true });
    const user = userEvent.setup();
    render(<ManageMarketplaceSettings />);

    await user.click(screen.getByRole('button', { name: /add new marketplace/i }));
    await user.type(
      screen.getByPlaceholderText(/marketplace\.json/i),
      'https://priv.test/marketplace.json',
    );
    await user.click(screen.getByRole('button', { name: /bearer \/ token/i }));
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/credential is required/i)).toBeInTheDocument();
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
    vi.mocked(useMarketplaceCanEdit).mockReturnValue({ data: { canEdit: true } } as never);
    vi.mocked(useCreateMarketplaceSource).mockReturnValue({
      mutate: createMutate,
      isPending: false,
    } as never);
    vi.mocked(useDeleteMarketplaceSource).mockReturnValue({
      mutate: deleteMutate,
      isPending: false,
    } as never);

    render(<ManageMarketplaceSettings />);
    expect(screen.getByText('Bearer')).toBeInTheDocument();
    // No password/token input is rendered for an existing source (no edit form).
    expect(screen.queryByPlaceholderText(/sent once on save/i)).not.toBeInTheDocument();
  });
});
