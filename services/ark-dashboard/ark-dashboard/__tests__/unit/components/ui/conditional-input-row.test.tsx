import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      <ConditionalInputRow
        data={{
          key: 'row-1',
          name: 'Authorization',
          type,
          value: data.value ?? '',
          secretKey: data.secretKey,
        }}
        onChange={onChange}
        secrets={secrets}
        deleteRow={vi.fn()}
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

    const [, secretSelect] = screen.getAllByRole('combobox');
    await userEvent.click(secretSelect);
    await userEvent.click(screen.getByRole('option', { name: 'secret-b' }));

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
});
