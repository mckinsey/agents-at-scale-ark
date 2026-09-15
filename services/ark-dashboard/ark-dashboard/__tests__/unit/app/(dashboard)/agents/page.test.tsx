import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AgentsPage from '@/app/(dashboard)/agents/page';

vi.mock('@/components/sections/agents-section', () => ({
  AgentsSection: () => (
    <div data-testid="agents-section">Agents Section</div>
  ),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('AgentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render agents section', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AgentsPage />
      </QueryClientProvider>
    );
    expect(screen.getByTestId('agents-section')).toBeInTheDocument();
  });
});
