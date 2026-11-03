import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { McpServerFields } from '@/components/forms/mcp-forms/mcp-server-fields';
import type { FormValues } from '@/components/forms/mcp-forms/utils';
import { useHeaderRows } from '@/components/forms/mcp-forms/utils';

vi.mock('@/lib/services/secrets-hooks', () => ({
  useGetAllSecrets: () => ({ data: [] }),
  useCreateSecret: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
}));

vi.mock('@/lib/services/configurations-hooks', () => ({
  useGetAllConfigurations: () => ({ data: [], isPending: false }),
  useCreateConfiguration: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  }),
}));

type HarnessProps = {
  readonly transport: FormValues['transport'];
};

function Harness({ transport }: HarnessProps) {
  const form = useForm<FormValues>({
    defaultValues: {
      name: 'github-mcp',
      description: '',
      configurationName: '',
      transport,
    },
  });
  const headerRows = useHeaderRows([]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <McpServerFields
        form={form}
        headerRows={headerRows}
        urlState={{ kind: 'create' }}
      />
    </QueryClientProvider>
  );
}

describe('McpServerFields transport', () => {
  it('warns that sse is deprecated', () => {
    render(<Harness transport="sse" />);
    expect(screen.getByText(/sse is deprecated/i)).toBeInTheDocument();
  });

  it('does not warn for http', () => {
    render(<Harness transport="http" />);
    expect(screen.queryByText(/sse is deprecated/i)).not.toBeInTheDocument();
  });
});
