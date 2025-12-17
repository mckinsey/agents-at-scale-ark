import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamEditor } from '@/components/editors/team-editor';
import type { Agent } from '@/lib/services';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./member-editor', () => ({
  TeamMemberSelectionSection: () => null,
}));

describe('TeamEditor', () => {
  const mockAgents: Agent[] = [
    {
      id: 'agent-1',
      name: 'test-agent-1',
      description: 'Test agent 1',
    } as Agent,
    {
      id: 'agent-2',
      name: 'test-agent-2',
      description: 'Test agent 2',
    } as Agent,
  ];

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSave: vi.fn(),
    agents: mockAgents,
    team: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('name validation', () => {
    it('should show error when name is empty on submit', async () => {
      const user = userEvent.setup();
      render(<TeamEditor {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error for name with uppercase letters', async () => {
      const user = userEvent.setup();
      render(<TeamEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g., engineering-team');
      await user.type(nameInput, 'invalidTeam');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(
          screen.getByText(
            'Name can only contain lowercase letters, numbers, hyphens, and dots',
          ),
        ).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error for name starting with hyphen', async () => {
      const user = userEvent.setup();
      render(<TeamEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g., engineering-team');
      await user.type(nameInput, '-invalid-team');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(
          screen.getByText('Name must start with a lowercase letter or number'),
        ).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });
  });

  describe('members validation', () => {
    it('should show error when no members selected', async () => {
      const user = userEvent.setup();
      render(<TeamEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g., engineering-team');
      await user.type(nameInput, 'valid-team');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(
          screen.getByText('At least one team member is required'),
        ).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should allow submission when members are selected', async () => {
      const user = userEvent.setup();
      render(<TeamEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g., engineering-team');
      await user.type(nameInput, 'valid-team');

      const checkbox = screen.getAllByRole('checkbox')[0];
      await user.click(checkbox);

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalled();
      });
    });
  });

  describe('strategy display', () => {
    it('should show strategy dropdown', async () => {
      render(<TeamEditor {...defaultProps} />);

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should default to round-robin strategy', async () => {
      render(<TeamEditor {...defaultProps} />);

      const combobox = screen.getByRole('combobox');
      expect(combobox).toHaveTextContent('Round Robin');
    });
  });

  describe('successful submission', () => {
    it('should call onSave with valid team data', async () => {
      const user = userEvent.setup();
      render(<TeamEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g., engineering-team');
      await user.type(nameInput, 'my-team');

      const checkbox = screen.getAllByRole('checkbox')[0];
      await user.click(checkbox);

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'my-team',
            strategy: 'round-robin',
            members: expect.arrayContaining([
              expect.objectContaining({ name: 'test-agent-1' }),
            ]),
          }),
        );
      });
    });

    it('should include description when provided', async () => {
      const user = userEvent.setup();
      render(<TeamEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g., engineering-team');
      await user.type(nameInput, 'my-team');

      const descInput = screen.getByPlaceholderText(
        'e.g., Core development and infrastructure team',
      );
      await user.type(descInput, 'My team description');

      const checkbox = screen.getAllByRole('checkbox')[0];
      await user.click(checkbox);

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'my-team',
            description: 'My team description',
          }),
        );
      });
    });
  });

  describe('edit mode', () => {
    const existingTeam = {
      id: 'team-1',
      name: 'existing-team',
      namespace: 'default',
      description: 'Existing team description',
      strategy: 'round-robin',
      members: [{ name: 'test-agent-1', type: 'agent' as const }],
    };

    it('should disable name field when editing', async () => {
      render(<TeamEditor {...defaultProps} team={existingTeam} />);

      const nameInput = screen.getByPlaceholderText('e.g., engineering-team');
      expect(nameInput).toBeDisabled();
    });

    it('should show Update button when editing', async () => {
      render(<TeamEditor {...defaultProps} team={existingTeam} />);

      expect(
        screen.getByRole('button', { name: /update/i }),
      ).toBeInTheDocument();
    });
  });

  describe('dialog behavior', () => {
    it('should call onOpenChange when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<TeamEditor {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });

    it('should show member count', async () => {
      const user = userEvent.setup();
      render(<TeamEditor {...defaultProps} />);

      expect(screen.getByText('0 members selected')).toBeInTheDocument();

      const checkbox = screen.getAllByRole('checkbox')[0];
      await user.click(checkbox);

      await waitFor(() => {
        expect(screen.getByText('1 member selected')).toBeInTheDocument();
      });
    });
  });
});

