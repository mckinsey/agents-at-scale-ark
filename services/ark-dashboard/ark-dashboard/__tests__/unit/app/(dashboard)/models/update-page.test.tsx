import { act, render } from '@testing-library/react';
import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseGetModelbyId = vi.fn(() => ({ data: null, isPending: false }));

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(
    () => new URLSearchParams('namespace=custom-ns'),
  ),
}));

vi.mock('@/lib/services/models-hooks', () => ({
  useGetModelbyId: (...args: unknown[]) => mockUseGetModelbyId(...args),
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

vi.mock('@/components/forms', () => ({
  UpdateModelForm: () => <div data-testid="update-model-form" />,
}));

import ModelUpdatePage from '@/app/(dashboard)/models/[model_id]/update/page';

describe('ModelUpdatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes namespace to useGetModelbyId', async () => {
    const resolvedParams = { model_id: 'test-model' };

    await act(async () => {
      render(
        <Suspense fallback={<div>Loading</div>}>
          <ModelUpdatePage params={Promise.resolve(resolvedParams)} />
        </Suspense>,
      );
    });

    expect(mockUseGetModelbyId).toHaveBeenCalledWith({
      modelId: 'test-model',
      namespace: 'custom-ns',
    });
  });
});
