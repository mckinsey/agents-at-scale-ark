import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

function renderRow(type: 'direct' | 'secret') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ConditionalInputRow
        data={{ key: 'row-1', name: 'Authorization', type, value: '' }}
        onChange={onChange}
        secrets={[{ id: 'github-pat', name: 'github-pat' }]}
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
});
