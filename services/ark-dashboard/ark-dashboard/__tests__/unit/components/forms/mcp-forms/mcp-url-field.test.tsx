import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { McpUrlField } from '@/components/forms/mcp-forms/mcp-url-field';
import type {
  FormValues,
  UrlFieldState,
} from '@/components/forms/mcp-forms/utils';

vi.mock('@/lib/services/configurations-hooks', () => ({
  useGetAllConfigurations: () => ({
    data: [
      { name: 'github-mcp-url', value: 'https://api.githubcopilot.com/mcp/' },
    ],
    isPending: false,
  }),
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

function Harness({ state }: { readonly state: UrlFieldState }) {
  const form = useForm<FormValues>({
    defaultValues: {
      name: 'github-mcp',
      description: 'x',
      configurationName:
        state.kind === 'configuration' ? state.configurationName : '',
      transport: 'http',
    },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <McpUrlField form={form} state={state} />
    </QueryClientProvider>
  );
}

describe('McpUrlField', () => {
  it('offers the picker when creating', () => {
    render(<Harness state={{ kind: 'create' }} />);
    expect(screen.getByText('Select a configuration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add New' })).toBeInTheDocument();
    expect(screen.queryByText(/stored in/i)).not.toBeInTheDocument();
  });

  it('warns and offers conversion for a literal address', () => {
    render(
      <Harness
        state={{ kind: 'literal', url: 'https://api.githubcopilot.com/mcp/' }}
      />,
    );
    expect(
      screen.getByText(/https:\/\/api\.githubcopilot\.com\/mcp\//),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Move to configuration' }),
    ).toBeInTheDocument();
  });

  it('renders a service reference read-only', () => {
    render(
      <Harness
        state={{
          kind: 'service',
          serviceRef: {
            name: 'ark-mcp',
            port: 'http',
            path: '/mcp',
            namespace: 'ark',
          },
          resolvedAddress: 'http://ark-mcp.ark.svc.cluster.local:80/mcp',
        }}
      />,
    );
    expect(screen.getByText(/ark-mcp/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add New' }),
    ).not.toBeInTheDocument();
  });
});
