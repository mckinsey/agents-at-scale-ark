import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAllAgents = vi.fn().mockResolvedValue([]);
const mockGetAllModels = vi.fn().mockResolvedValue([]);
const mockGetAllTeams = vi.fn().mockResolvedValue([]);
const mockGetAllTools = vi.fn().mockResolvedValue([]);
const mockGetAllMemories = vi.fn().mockResolvedValue([]);

vi.mock('@/lib/services', () => ({
  agentsService: {
    getAll: (...args: unknown[]) => mockGetAllAgents(...args),
    getByName: vi.fn().mockResolvedValue(null),
  },
  modelsService: {
    getAll: (...args: unknown[]) => mockGetAllModels(...args),
  },
  teamsService: {
    getAll: (...args: unknown[]) => mockGetAllTeams(...args),
  },
  toolsService: {
    getAll: (...args: unknown[]) => mockGetAllTools(...args),
    getByName: vi.fn().mockResolvedValue(null),
  },
  memoriesService: {
    getAll: (...args: unknown[]) => mockGetAllMemories(...args),
  },
  evaluationsService: {
    getByQuery: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/lib/services/queries', () => ({
  queriesService: {
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ name: 'test-query' }),
  },
}));

vi.mock('@/lib/services/agents', () => ({
  agentsService: {
    getByName: vi.fn().mockResolvedValue(null),
  },
}));

const mockNamespace = 'test-ns';
vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    namespace: mockNamespace,
    isNamespaceResolved: true,
    availableNamespaces: [{ name: mockNamespace }],
    isPending: false,
    setNamespace: vi.fn(),
    createNamespace: vi.fn(),
    readOnlyMode: false,
  })),
}));

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ id: 'new' })),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(() => null),
  })),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

vi.mock('@/lib/hooks/use-markdown-processor', () => ({
  useMarkdownProcessor: vi.fn(() => '<p></p>'),
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

vi.mock('@/components/query-actions', () => ({
  QueryEvaluationActions: () => <div />,
}));

vi.mock('@/components/query-fields/query-memory-field', () => ({
  QueryMemoryField: () => <div />,
}));

vi.mock('@/components/query-fields/query-targets-field', () => ({
  QueryTargetsField: () => <div />,
}));

vi.mock('@/components/ErrorResponseContent', () => ({
  ErrorResponseContent: () => <div />,
}));

vi.mock('@/components/JsonDisplay', () => ({
  default: () => <div />,
}));

vi.mock('jotai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jotai')>();
  return {
    ...actual,
    useAtomValue: vi.fn(() => 30),
  };
});

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock('@/lib/constants/breadcrumbs', () => ({
  BASE_BREADCRUMBS: [],
}));

vi.mock('@/lib/constants/annotations', () => ({
  ARK_ANNOTATIONS: {},
}));

import QueryDetailPage from '@/app/(dashboard)/query/[id]/page';

describe('QueryDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass namespace to all five service calls when loading resources for a new query', async () => {
    render(<QueryDetailPage />);

    await waitFor(() => {
      expect(mockGetAllAgents).toHaveBeenCalledWith(mockNamespace);
    });

    expect(mockGetAllModels).toHaveBeenCalledWith(mockNamespace);
    expect(mockGetAllTeams).toHaveBeenCalledWith(mockNamespace);
    expect(mockGetAllTools).toHaveBeenCalledWith(mockNamespace);
    expect(mockGetAllMemories).toHaveBeenCalledWith(mockNamespace);
  });
});
