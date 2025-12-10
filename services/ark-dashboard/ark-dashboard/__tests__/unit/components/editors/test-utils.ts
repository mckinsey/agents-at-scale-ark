import { vi } from 'vitest';

export const mockApiClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

export const mockServices = {
  agentsService: {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  teamsService: {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  modelsService: {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
  },
  toolsService: {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
  },
  secretsService: {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
  },
  mcpServersService: {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  evaluatorsService: {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    create: vi.fn(),
  },
  evaluationsService: {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    create: vi.fn(),
  },
  queriesService: {
    getAll: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
  },
};

export const setupMocks = () => {
  vi.mock('@/lib/api/client', () => ({
    apiClient: mockApiClient,
  }));

  vi.mock('@/lib/services', () => mockServices);
};

export const mockAgent = {
  id: 'agent-1',
  name: 'test-agent',
  description: 'Test agent description',
  model: 'gpt-4',
};

export const mockTeam = {
  id: 'team-1',
  name: 'test-team',
  description: 'Test team description',
  members: [],
  strategy: 'round-robin',
};

export const mockModel = {
  id: 'model-1',
  name: 'test-model',
  provider: 'openai',
};

export const mockSecret = {
  id: 'secret-1',
  name: 'test-secret',
};

export const mockEvaluator = {
  id: 'evaluator-1',
  name: 'test-evaluator',
  model: 'test-model',
};

export const fillInput = async (
  user: ReturnType<typeof import('@testing-library/user-event').default.setup>,
  element: HTMLElement,
  value: string,
) => {
  await user.clear(element);
  await user.type(element, value);
};

export const selectOption = async (
  user: ReturnType<typeof import('@testing-library/user-event').default.setup>,
  trigger: HTMLElement,
  optionText: string,
) => {
  await user.click(trigger);
  const option = document.querySelector(`[data-value="${optionText}"]`);
  if (option) {
    await user.click(option);
  }
};

