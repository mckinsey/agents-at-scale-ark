import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetByName = vi.fn().mockResolvedValue({
  name: 'test-team',
  id: 'test-team',
  description: 'A test team',
  members: [],
  strategy: 'round-robin',
});
const mockGetAllAgents = vi.fn().mockResolvedValue([]);

vi.mock('@/lib/services', () => ({
  teamsService: {
    getByName: (...args: unknown[]) => mockGetByName(...args),
  },
  agentsService: {
    getAll: (...args: unknown[]) => mockGetAllAgents(...args),
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

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

import { TeamFormMode } from '@/components/forms/team-form/types';
import { useTeamForm } from '@/components/forms/team-form/use-team-form';

describe('useTeamForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass namespace to teamsService.getByName in EDIT mode', async () => {
    renderHook(() =>
      useTeamForm({
        mode: TeamFormMode.EDIT,
        teamName: 'test-team',
      }),
    );

    await waitFor(() => {
      expect(mockGetByName).toHaveBeenCalledWith('test-team', mockNamespace);
    });
  });

  it('should pass namespace to teamsService.getByName in VIEW mode', async () => {
    renderHook(() =>
      useTeamForm({
        mode: TeamFormMode.VIEW,
        teamName: 'test-team',
      }),
    );

    await waitFor(() => {
      expect(mockGetByName).toHaveBeenCalledWith('test-team', mockNamespace);
    });
  });

  it('should pass namespace to agentsService.getAll', async () => {
    renderHook(() =>
      useTeamForm({
        mode: TeamFormMode.EDIT,
        teamName: 'test-team',
      }),
    );

    await waitFor(() => {
      expect(mockGetAllAgents).toHaveBeenCalledWith(mockNamespace);
    });
  });
});
