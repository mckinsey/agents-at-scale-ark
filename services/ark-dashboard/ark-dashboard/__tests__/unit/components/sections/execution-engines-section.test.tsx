import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExecutionEnginesSection } from '@/components/sections/execution-engines-section';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ExecutionEngine } from '@/lib/services/engines';
import {
  useDeleteExecutionEngine,
  useExecutionEngineDeleteAccess,
  useGetAllExecutionEngines,
} from '@/lib/services/engines-hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

vi.mock('@/lib/services/engines-hooks', () => ({
  useGetAllExecutionEngines: vi.fn(),
  useDeleteExecutionEngine: vi.fn(),
  useExecutionEngineDeleteAccess: vi.fn(),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(),
}));

const engine: ExecutionEngine = {
  name: 'my-engine',
  namespace: 'test-namespace',
  phase: 'ready',
};

function setup({
  allowed,
  readOnlyMode = false,
}: {
  allowed?: boolean;
  readOnlyMode?: boolean;
}) {
  vi.mocked(useNamespace).mockReturnValue({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode,
  } as unknown as ReturnType<typeof useNamespace>);
  vi.mocked(useGetAllExecutionEngines).mockReturnValue({
    data: [engine],
    isLoading: false,
  } as unknown as ReturnType<typeof useGetAllExecutionEngines>);
  vi.mocked(useDeleteExecutionEngine).mockReturnValue({
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof useDeleteExecutionEngine>);
  vi.mocked(useExecutionEngineDeleteAccess).mockReturnValue({
    data: allowed,
  } as unknown as ReturnType<typeof useExecutionEngineDeleteAccess>);
}

function renderSection() {
  return render(
    <TooltipProvider>
      <ExecutionEnginesSection />
    </TooltipProvider>,
  );
}

const deleteButton = () =>
  screen.queryByRole('button', { name: 'Delete execution engine' });

describe('ExecutionEnginesSection delete access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers delete when the review allows it', () => {
    setup({ allowed: true });

    renderSection();

    expect(screen.getByText('my-engine')).toBeInTheDocument();
    expect(deleteButton()).toBeInTheDocument();
  });

  it('hides delete when the review refuses it', () => {
    setup({ allowed: false });

    renderSection();

    expect(screen.getByText('my-engine')).toBeInTheDocument();
    expect(deleteButton()).not.toBeInTheDocument();
  });

  it('hides delete until the review answers', () => {
    setup({});

    renderSection();

    expect(deleteButton()).not.toBeInTheDocument();
  });

  it('hides delete in read-only mode even when the review allows it', () => {
    setup({ allowed: true, readOnlyMode: true });

    renderSection();

    expect(deleteButton()).not.toBeInTheDocument();
  });
});
