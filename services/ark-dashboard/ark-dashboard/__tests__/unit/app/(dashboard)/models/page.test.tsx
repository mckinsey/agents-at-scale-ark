import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseGetAllModels = vi.fn(() => ({ data: [] }));

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(
    () => new URLSearchParams('namespace=custom-ns'),
  ),
}));

vi.mock('@/lib/services/models-hooks', () => ({
  useGetAllModels: (...args: unknown[]) => mockUseGetAllModels(...args),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    namespace: 'custom-ns',
    readOnlyMode: false,
    setNamespace: vi.fn(),
  })),
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

vi.mock('@/components/sections/models-section', () => ({
  ModelsSection: () => <div data-testid="models-section" />,
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import ModelsPage from '@/app/(dashboard)/models/page';

describe('ModelsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes namespace from search params to useGetAllModels', () => {
    render(<ModelsPage />);

    expect(mockUseGetAllModels).toHaveBeenCalledWith('custom-ns');
  });
});
