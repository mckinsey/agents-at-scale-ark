import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateResourceButton } from '@/components/forms/shared/create-resource-dialog';
import { APIError } from '@/lib/api/client';

const createConfiguration = vi.fn();

vi.mock('@/lib/services/configurations', () => ({
  configurationsService: {
    create: (request: { name: string; value: string }) =>
      createConfiguration(request),
  },
}));

vi.mock('@/lib/services/secrets', () => ({
  secretsService: {
    create: vi.fn(),
  },
}));

function renderButton(
  props: Partial<Parameters<typeof CreateResourceButton>[0]> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onCreated = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <CreateResourceButton
        kind="configuration"
        onCreated={onCreated}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onCreated };
}

describe('CreateResourceButton', () => {
  beforeEach(() => {
    createConfiguration.mockReset();
  });

  it('reports the created name and closes', async () => {
    createConfiguration.mockResolvedValue({
      name: 'github-mcp-url',
      value: 'https://api.githubcopilot.com/mcp/',
    });
    const { onCreated } = renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Add New' }));
    await userEvent.type(screen.getByLabelText('Name'), 'github-mcp-url');
    await userEvent.type(
      screen.getByLabelText('Value'),
      'https://api.githubcopilot.com/mcp/',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith('github-mcp-url'),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('keeps the dialog open when creation fails', async () => {
    createConfiguration.mockRejectedValue(new Error('Conflict'));
    const { onCreated } = renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Add New' }));
    await userEvent.type(screen.getByLabelText('Name'), 'github-mcp-url');
    await userEvent.type(screen.getByLabelText('Value'), 'https://x/mcp');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createConfiguration).toHaveBeenCalled());
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('github-mcp-url');
  });

  it('shows a 409 collision inline on the Name field', async () => {
    createConfiguration.mockRejectedValue(new APIError('Conflict', 409));
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Add New' }));
    await userEvent.type(screen.getByLabelText('Name'), 'github-mcp-url');
    await userEvent.type(screen.getByLabelText('Value'), 'https://x/mcp');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      await screen.findByText(
        'A Configuration with the name "github-mcp-url" already exists.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('locks the dialog and the fields while the request is in flight', async () => {
    let release: (value: { name: string; value: string }) => void = () => {};
    createConfiguration.mockReturnValue(
      new Promise<{ name: string; value: string }>(resolve => {
        release = resolve;
      }),
    );
    const { onCreated } = renderButton();

    await userEvent.click(screen.getByRole('button', { name: 'Add New' }));
    await userEvent.type(screen.getByLabelText('Name'), 'github-mcp-url');
    await userEvent.type(screen.getByLabelText('Value'), 'https://x/mcp');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Name')).toBeDisabled(),
    );
    expect(screen.getByLabelText('Value')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    release({ name: 'github-mcp-url', value: 'https://x/mcp' });

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith('github-mcp-url'),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('prefills the value when given one', async () => {
    renderButton({ defaultValue: 'https://api.githubcopilot.com/mcp/' });

    await userEvent.click(screen.getByRole('button', { name: 'Add New' }));

    expect(screen.getByLabelText('Value')).toHaveValue(
      'https://api.githubcopilot.com/mcp/',
    );
  });
});
