import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConditionalInputRow } from '@/components/ui/conditionalInputRow';

vi.mock('@/lib/services/configurations-hooks', () => ({
  useCreateConfiguration: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
}));

vi.mock('@/lib/services/secrets-hooks', () => ({
  useCreateSecret: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
}));

type RowData = React.ComponentProps<typeof ConditionalInputRow>['data'];

function StatefulRow({
  initial,
  secrets,
  onChange,
}: {
  initial: RowData;
  secrets: { id: string; name: string }[];
  onChange: (update: Partial<RowData>) => void;
}) {
  const [data, setData] = useState(initial);
  return (
    <ConditionalInputRow
      data={data}
      onChange={update => {
        onChange(update);
        setData(current => ({ ...current, ...update }));
      }}
      secrets={secrets}
      deleteRow={vi.fn()}
    />
  );
}

function renderRow(
  type: 'direct' | 'secret',
  data: Partial<{ value: string; secretKey: string }> = {},
  secrets = [{ id: 'github-pat', name: 'github-pat' }],
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <StatefulRow
        initial={{
          key: 'row-1',
          name: 'Authorization',
          type,
          value: data.value ?? '',
          secretKey: data.secretKey,
        }}
        onChange={onChange}
        secrets={secrets}
      />
    </QueryClientProvider>,
  );
  return { onChange };
}

describe('ConditionalInputRow', () => {
  it('offers Add New for a secret row', () => {
    renderRow('secret');
    expect(screen.getByRole('button', { name: 'Add New' })).toBeInTheDocument();
  });

  it('does not offer Add New for a direct row', () => {
    renderRow('direct');
    expect(
      screen.queryByRole('button', { name: 'Add New' }),
    ).not.toBeInTheDocument();
  });

  it('clears the preserved secretKey when a different secret is picked (#3317)', async () => {
    const { onChange } = renderRow(
      'secret',
      { value: 'secret-a', secretKey: 'apiKey' },
      [
        { id: 'secret-a', name: 'secret-a' },
        { id: 'secret-b', name: 'secret-b' },
      ],
    );

    await userEvent.click(screen.getByRole('button', { name: 'Clear secret' }));
    await userEvent.click(
      screen.getByRole('combobox', { name: 'Secret name' }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: 'secret-b' }),
    );

    expect(onChange).toHaveBeenCalledWith({
      value: 'secret-b',
      secretKey: undefined,
    });
  });

  it('clears the preserved secretKey when the type changes', async () => {
    const { onChange } = renderRow('secret', {
      value: 'secret-a',
      secretKey: 'apiKey',
    });

    const [typeSelect] = screen.getAllByRole('combobox');
    await userEvent.click(typeSelect);
    await userEvent.click(
      await screen.findByRole('option', { name: 'direct' }),
    );

    expect(onChange).toHaveBeenCalledWith({
      type: 'direct',
      value: '',
      secretKey: undefined,
    });
  });

  it('renders a stored name outside the list without touching secretKey', () => {
    const { onChange } = renderRow('secret', {
      value: 'kubectl-made',
      secretKey: 'apiKey',
    });

    expect(screen.getByRole('combobox', { name: 'Secret name' })).toHaveValue(
      'kubectl-made',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears secretKey when a name is typed', async () => {
    const { onChange } = renderRow('secret', {}, []);

    await userEvent.click(
      screen.getByRole('combobox', { name: 'Secret name' }),
    );
    await userEvent.keyboard('kubectl-made');

    expect(onChange).toHaveBeenLastCalledWith({
      value: 'kubectl-made',
      secretKey: undefined,
    });
  });

  it('gives the value column the same width for direct and secret rows', () => {
    renderRow('direct');
    const [, directValue] = screen.getAllByRole('textbox');
    const directCell = directValue.closest('.flex-\\[2\\]');
    cleanup();

    renderRow('secret');
    const secretCell = screen
      .getByRole('combobox', { name: 'Secret name' })
      .closest('.flex-\\[2\\]');

    expect(directCell).not.toBeNull();
    expect(secretCell).not.toBeNull();
  });
});
