import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FilesPage from '@/app/(dashboard)/files/page';

vi.mock('@/components/common/page-header', () => ({
  PageHeader: vi.fn(() => (
    <div data-testid="page-header">Page Header</div>
  )),
}));

vi.mock('@/components/sections/files-section', () => {
  const React = require('react');
  return {
    FilesSection: React.forwardRef(() => (
      <div data-testid="files-section">Files Section</div>
    )),
  };
});

const mockUseAtomValue = vi.fn();

vi.mock('jotai', async importOriginal => {
  const actual = (await importOriginal()) as typeof import('jotai');
  return {
    ...actual,
    useAtomValue: (atom: unknown) => mockUseAtomValue(atom),
  };
});

vi.mock('@/lib/services/files-count-hooks', () => ({
  useGetFilesCount: vi.fn(() => ({
    data: 5,
    isPending: false,
    error: null,
  })),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('FilesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display FilesSection when feature flag is enabled', () => {
    mockUseAtomValue.mockReturnValue(true);

    render(
      <QueryClientProvider client={queryClient}>
        <FilesPage />
      </QueryClientProvider>
    );

    expect(screen.getByTestId('files-section')).toBeInTheDocument();
    expect(screen.queryByText(/file gateway service/i)).not.toBeInTheDocument();
  });

  it('should display setup instructions when feature flag is disabled', () => {
    mockUseAtomValue.mockReturnValue(false);

    render(
      <QueryClientProvider client={queryClient}>
        <FilesPage />
      </QueryClientProvider>
    );

    expect(screen.queryByTestId('files-section')).not.toBeInTheDocument();
    expect(
      screen.getByText(/File Gateway Service Not Configured/i),
    ).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /File Gateway Service/i });
    expect(link).toHaveAttribute(
      'href',
      'https://mckinsey.github.io/agents-at-scale-marketplace/services/file-gateway/',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
