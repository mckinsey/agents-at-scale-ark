import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { storedIsExperimentalExecutionEngineEnabledAtom } from '@/atoms/experimental-features';
import { AgentFormMode } from '@/components/forms/agent-form/types';
import { useAgentForm } from '@/components/forms/agent-form/use-agent-form';
import { agentsService, executionEnginesService } from '@/lib/services';

const OUTPUT_SCHEMA_KEY =
  'executor-openai-responses.ark.mckinsey.com/output-schema';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/services', () => ({
  agentsService: {
    getByName: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  executionEnginesService: { getAll: vi.fn().mockResolvedValue([]) },
  modelsService: { list: vi.fn().mockResolvedValue([]) },
  toolsService: { getAll: vi.fn().mockResolvedValue([]) },
}));

let store = createStore();

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Provider>
  );
}

function mockAgent(engine: string, annotations: Record<string, string> = {}) {
  vi.mocked(agentsService.getByName).mockResolvedValue({
    id: 'a1',
    name: 'a1',
    namespace: 'test-namespace',
    isA2A: false,
    executionEngine: { name: engine },
    annotations,
  });
  vi.mocked(agentsService.update).mockResolvedValue({
    id: 'a1',
    name: 'a1',
    namespace: 'test-namespace',
    isA2A: false,
  });
}

async function renderLoadedForm() {
  const hook = renderHook(
    () => useAgentForm({ mode: AgentFormMode.VIEW, agentName: 'a1' }),
    { wrapper },
  );
  await waitFor(() => {
    expect(hook.result.current.state.loading).toBe(false);
  });
  return hook;
}

describe('useAgentForm output schema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store = createStore();
  });

  it('loads the schema from the agent annotation', async () => {
    mockAgent('executor-openai-responses', {
      [OUTPUT_SCHEMA_KEY]: '{"type":"object"}',
    });

    const { result } = await renderLoadedForm();

    expect(result.current.form.getValues('outputSchema')).toBe(
      '{"type":"object"}',
    );
  });

  it('writes the schema annotation on save for openai-responses agents', async () => {
    mockAgent('executor-openai-responses');
    const { result } = await renderLoadedForm();

    await act(async () => {
      await result.current.actions.onSubmit({
        ...result.current.form.getValues(),
        outputSchema: '{"type":"object"}',
      });
    });

    expect(agentsService.update).toHaveBeenCalledWith(
      'test-namespace',
      'a1',
      expect.objectContaining({
        annotations: { [OUTPUT_SCHEMA_KEY]: '{"type":"object"}' },
      }),
    );
  });

  it('removes the annotation when the schema is cleared', async () => {
    mockAgent('executor-openai-responses', {
      [OUTPUT_SCHEMA_KEY]: '{"type":"object"}',
    });
    const { result } = await renderLoadedForm();

    await act(async () => {
      await result.current.actions.onSubmit({
        ...result.current.form.getValues(),
        outputSchema: '  ',
      });
    });

    expect(agentsService.update).toHaveBeenCalledWith(
      'test-namespace',
      'a1',
      expect.objectContaining({
        annotations: { [OUTPUT_SCHEMA_KEY]: null },
      }),
    );
  });

  it('leaves annotations untouched for other engines', async () => {
    mockAgent('executor-langchain');
    const { result } = await renderLoadedForm();

    await act(async () => {
      await result.current.actions.onSubmit(result.current.form.getValues());
    });

    expect(vi.mocked(agentsService.update).mock.calls[0][2].annotations).toBe(
      undefined,
    );
  });

  it('removes the annotation when the engine is switched away', async () => {
    store.set(storedIsExperimentalExecutionEngineEnabledAtom, true);
    mockAgent('executor-openai-responses', {
      [OUTPUT_SCHEMA_KEY]: '{"type":"object"}',
    });
    const { result } = await renderLoadedForm();

    await act(async () => {
      await result.current.actions.onSubmit({
        ...result.current.form.getValues(),
        executionEngineName: 'executor-langchain',
      });
    });

    expect(agentsService.update).toHaveBeenCalledWith(
      'test-namespace',
      'a1',
      expect.objectContaining({
        executionEngine: { name: 'executor-langchain' },
        annotations: { [OUTPUT_SCHEMA_KEY]: null },
      }),
    );
  });

  it('removes the annotation when the engine is cleared', async () => {
    store.set(storedIsExperimentalExecutionEngineEnabledAtom, true);
    mockAgent('executor-openai-responses', {
      [OUTPUT_SCHEMA_KEY]: '{"type":"object"}',
    });
    const { result } = await renderLoadedForm();

    await act(async () => {
      await result.current.actions.onSubmit({
        ...result.current.form.getValues(),
        executionEngineName: '__none__',
      });
    });

    expect(agentsService.update).toHaveBeenCalledWith(
      'test-namespace',
      'a1',
      expect.objectContaining({
        executionEngine: null,
        annotations: { [OUTPUT_SCHEMA_KEY]: null },
      }),
    );
  });

  it('skips schema validation when the engine does not support it', async () => {
    mockAgent('executor-langchain');
    const { result } = await renderLoadedForm();

    act(() => {
      result.current.form.setValue('outputSchema', '{"type":');
    });

    let valid = false;
    await act(async () => {
      valid = await result.current.form.trigger();
    });
    expect(valid).toBe(true);
  });

  it('validates the schema when the engine supports it', async () => {
    mockAgent('executor-openai-responses');
    const { result } = await renderLoadedForm();

    act(() => {
      result.current.form.setValue('outputSchema', '{"type":');
    });

    let valid = true;
    await act(async () => {
      valid = await result.current.form.trigger();
    });
    expect(valid).toBe(false);
    expect(
      result.current.form.getFieldState('outputSchema').error,
    ).toBeDefined();
  });

  it('detects openai-responses engines by their service annotation', async () => {
    store.set(storedIsExperimentalExecutionEngineEnabledAtom, true);
    vi.mocked(executionEnginesService.getAll).mockResolvedValue([
      {
        name: 'structured',
        namespace: 'test-namespace',
        phase: 'ready',
        annotations: {
          'ark.mckinsey.com/service': 'executor-openai-responses',
        },
      },
    ]);
    mockAgent('structured');
    const { result } = await renderLoadedForm();

    expect(result.current.actions.isOutputSchemaSupported('structured')).toBe(
      true,
    );
    expect(result.current.actions.isOutputSchemaSupported('other')).toBe(false);
  });
});
