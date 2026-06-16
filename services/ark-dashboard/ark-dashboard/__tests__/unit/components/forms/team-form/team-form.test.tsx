import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/teams'),
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
  teamsService: {
    getAll: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/components/forms/team-form/use-team-form', () => ({
  useTeamForm: vi.fn(() => ({
    form: {
      watch: vi.fn(() => ''),
      handleSubmit: vi.fn(),
      formState: { isSubmitting: false },
      control: {},
    },
    state: {
      loading: true,
      saving: false,
      deleting: false,
      team: null,
      models: [],
      agents: [],
      teams: [],
      hasChanges: false,
    },
    actions: {
      onSubmit: vi.fn(),
      onDelete: vi.fn(),
    },
  })),
}));

import { TeamForm } from '@/components/forms/team-form/team-form';

describe('TeamForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading spinner when loading', () => {
    const { container } = render(<TeamForm mode="create" />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });
});
