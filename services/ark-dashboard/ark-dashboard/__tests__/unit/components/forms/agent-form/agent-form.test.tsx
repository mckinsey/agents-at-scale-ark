import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/agents'),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    namespace: 'default',
    readOnlyMode: false,
  })),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock('@/lib/services', () => ({
  agentsService: { getAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/components/forms/agent-form/use-agent-form', () => ({
  useAgentForm: vi.fn(() => ({
    form: {
      watch: vi.fn(() => ''),
      handleSubmit: vi.fn(),
      formState: { isSubmitting: false },
      control: {},
    },
    state: {
      loading: true,
      saving: false,
      agent: null,
      models: [],
      executionEngines: [],
      availableTools: [],
      toolsLoading: false,
      selectedTools: [],
      unavailableTools: [],
      parameters: [],
      isExperimentalExecutionEngineEnabled: false,
      hasChanges: false,
    },
    actions: {
      setParameters: vi.fn(),
      handleToolToggle: vi.fn(),
      handleDeleteTool: vi.fn(),
      isToolSelected: vi.fn(),
      onSubmit: vi.fn(),
    },
  })),
}));

import { AgentForm } from '@/components/forms/agent-form/agent-form';

describe('AgentForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading spinner when loading', () => {
    const { container } = render(<AgentForm mode="create" />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });
});
