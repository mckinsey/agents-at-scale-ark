import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAllTeams = vi.fn().mockResolvedValue([
  { name: 'team-1', id: 'team-1' },
  { name: 'team-2', id: 'team-2' },
]);

vi.mock('@/lib/services', () => ({
  teamsService: {
    getAll: (...args: unknown[]) => mockGetAllTeams(...args),
    getByName: vi.fn().mockResolvedValue({
      name: 'test-team',
      id: 'test-team',
      description: '',
      members: [],
      strategy: 'round-robin',
    }),
  },
  agentsService: {
    getAll: vi.fn().mockResolvedValue([]),
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

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

vi.mock('@/components/common/page-header', () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));

vi.mock('@/components/chat/embedded-chat-panel', () => ({
  EmbeddedChatPanel: () => <div data-testid="chat-panel" />,
}));

vi.mock('@/components/common/panel-toggle-button', () => ({
  PanelToggleButton: () => <div />,
}));

vi.mock('@/components/common/yaml-viewer', () => ({
  YamlViewer: () => <div />,
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({ children, ...props }: { children: React.ReactNode; href: string }) => (
    <a {...props}>{children}</a>
  ),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

import { TeamForm } from '@/components/forms/team-form/team-form';
import { TeamFormMode } from '@/components/forms/team-form/types';

describe('TeamForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass namespace to teamsService.getAll in VIEW mode', async () => {
    render(
      <TeamForm
        mode={TeamFormMode.VIEW}
        teamName="test-team"
      />,
    );

    await waitFor(() => {
      expect(mockGetAllTeams).toHaveBeenCalledWith(mockNamespace);
    });
  });
});
