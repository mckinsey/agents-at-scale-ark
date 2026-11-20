import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SecretsSection } from '@/components/sections/secrets-section';
import type { Secret } from '@/lib/services/secrets';
import { useGetAllSecrets } from '@/lib/services/secrets-hooks';

let searchQuery = '';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ namespace: 'default', readOnlyMode: false }),
}));

vi.mock('@/lib/hooks/use-url-state', () => ({
  SEARCH_DEBOUNCE_MS: 0,
  useUrlState: () => [{ q: searchQuery }, vi.fn()],
}));

vi.mock('@/lib/hooks', () => ({
  useDelayedLoading: (loading: boolean) => loading,
}));

vi.mock('@/lib/services', () => ({
  modelsService: { listWithSecrets: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/lib/services/secrets-hooks', () => ({
  useGetAllSecrets: vi.fn(),
  useDeleteSecret: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/components/sections/secrets-table', () => ({
  SecretsTable: ({ secrets }: { secrets: Secret[] }) => (
    <ul>
      {secrets.map(secret => (
        <li key={secret.id}>{secret.name}</li>
      ))}
    </ul>
  ),
}));

const secrets: Secret[] = [
  {
    id: 'openai',
    name: 'openai',
    display_name: 'openai',
    scope: 'shared',
    labels: [],
  },
  {
    id: 'u-0123456789abcdef-github-pat',
    name: 'u-0123456789abcdef-github-pat',
    display_name: 'github-pat',
    scope: 'personal',
    labels: [],
  },
];

describe('SecretsSection', () => {
  beforeEach(() => {
    searchQuery = '';
    vi.mocked(useGetAllSecrets).mockReturnValue({
      data: secrets,
      isLoading: false,
    } as unknown as ReturnType<typeof useGetAllSecrets>);
  });

  it('lists shared and personal secrets together', () => {
    render(<SecretsSection />);

    expect(useGetAllSecrets).toHaveBeenCalledWith('all');
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(
      screen.getByText('u-0123456789abcdef-github-pat'),
    ).toBeInTheDocument();
  });

  it('finds a personal secret by its display name, ignoring case', () => {
    searchQuery = 'GitHub-PAT';

    render(<SecretsSection />);

    expect(
      screen.getByText('u-0123456789abcdef-github-pat'),
    ).toBeInTheDocument();
    expect(screen.queryByText('openai')).not.toBeInTheDocument();
  });
});
