import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeamCard } from '@/components/cards/team-card';
import type { Agent, Team, TeamMember } from '@/lib/services';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/components/ui/availability-status-badge', () => ({
  AvailabilityStatusBadge: vi.fn(({ status, eventsLink }) => (
    <a href={eventsLink} data-testid="availability-badge">
      Status: {status ? 'True' : 'False'}
    </a>
  )),
}));

vi.mock('@/components/dialogs/confirmation-dialog', () => ({
  ConfirmationDialog: vi.fn(
    ({
      open,
      title,
      onConfirm,
      confirmText,
    }: {
      open: boolean;
      title: string;
      onConfirm: () => void;
      confirmText: string;
    }) =>
      open ? (
        <div data-testid="confirmation-dialog">
          <div>{title}</div>
          <button onClick={onConfirm}>{confirmText}</button>
        </div>
      ) : null,
  ),
}));

vi.mock('@/components/editors', () => ({
  TeamEditor: vi.fn(
    ({
      open,
      team,
      agents,
      onOpenChange,
      onSave,
    }: {
      open: boolean;
      team: Team;
      agents: Agent[];
      onOpenChange: (open: boolean) => void;
      onSave: (team: Partial<Team> & { id?: string }) => void;
    }) =>
      open ? (
        <div data-testid="team-editor">
          <div>{team.name}</div>
          <button
            onClick={() => {
              onSave({ id: team.id, name: 'updated-name' } as Team);
              onOpenChange(false);
            }}>
            Update Name
          </button>
          <button
            onClick={() => {
              onSave({ id: team.id, description: 'Updated description' } as Team);
              onOpenChange(false);
            }}>
            Update Description
          </button>
          <button
            onClick={() => {
              const updatedMembers: TeamMember[] = agents.map(agent => ({
                type: 'agent',
                name: agent.name,
              }));
              onSave({ id: team.id, members: updatedMembers } as Team);
              onOpenChange(false);
            }}>
            Update Members
          </button>
          <button onClick={() => onOpenChange(false)}>Close</button>
        </div>
      ) : null,
  ),
}));

vi.mock('@/lib/chat-context', () => ({
  useChatState: () => ({
    isOpen: () => false,
  }),
}));

vi.mock('@/lib/chat-events', () => ({
  toggleFloatingChat: vi.fn(),
}));

vi.mock('@/components/cards/base-card', () => ({
  BaseCard: vi.fn(
    ({
      title,
      description,
      actions,
      footer,
    }: {
      title: string;
      description?: React.ReactNode;
      actions?: { label: string; onClick: () => void }[];
      footer?: React.ReactNode;
    }) => (
      <div data-testid="base-card">
        <div data-testid="card-title">{title}</div>
        {description && <div data-testid="card-description">{description}</div>}
        <div data-testid="card-actions">
          {actions?.map((action, idx) => (
            <button key={idx} onClick={action.onClick} aria-label={action.label}>
              {action.label}
            </button>
          ))}
        </div>
        <div data-testid="card-footer">{footer}</div>
      </div>
    ),
  ),
}));

describe('TeamCard', () => {
  const agents: Agent[] = [
    {
      id: 'agent1',
      name: 'agent1',
      description: 'First agent',
    } as Agent,
    {
      id: 'agent2',
      name: 'agent2',
      description: 'Second agent',
    } as Agent,
  ];

  const baseTeam: Team = {
    id: 'team-id',
    name: 'team-name',
    displayName: 'Team Name',
    description: 'Team description',
    members: [
      { type: 'agent', name: 'agent1' },
      { type: 'agent', name: 'agent2' },
    ],
    available: true,
  } as unknown as Team;

  it('should render team card with name, description, members and availability badge', () => {
    render(<TeamCard team={baseTeam} agents={agents} />);

    expect(screen.getByTestId('card-title')).toHaveTextContent('team-name');
    expect(screen.getByTestId('card-description')).toHaveTextContent(
      'Team description',
    );

    const membersText = screen.getByText(/2 members/);
    expect(membersText).toBeInTheDocument();

    const availabilityBadge = screen.getByTestId('availability-badge');
    expect(availabilityBadge).toHaveAttribute(
      'href',
      '/events?kind=Team&name=team-name&page=1',
    );
    expect(availabilityBadge).toHaveTextContent('Status: True');
  });

  it('should render team card with unavailable status when a member is missing', () => {
    const filtered_agents = agents.filter(agent => agent.name !== 'agent2')
    const teamUnavailable = {
      ...baseTeam,
      available: false
    }as unknown as Team;
    render(<TeamCard team={teamUnavailable} agents={filtered_agents} />);

    expect(screen.getByTestId('card-title')).toHaveTextContent('team-name');
    expect(screen.getByTestId('card-description')).toHaveTextContent(
      'Team description',
    );

    const membersText = screen.getByText(/2 members/);
    expect(membersText).toBeInTheDocument();

    const availabilityBadge = screen.getByTestId('availability-badge');
    expect(availabilityBadge).toHaveAttribute(
      'href',
      '/events?kind=Team&name=team-name&page=1',
    );
    expect(availabilityBadge).toHaveTextContent('Status: False');
  });

  it('should call onUpdate when updating team name', async () => {
    const onUpdate = vi.fn();
    render(<TeamCard team={baseTeam} agents={agents} onUpdate={onUpdate} />);

    await userEvent.click(screen.getByRole('button', { name: /edit team/i }));

    expect(screen.getByTestId('team-editor')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /update name/i }));

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'team-id', name: 'updated-name' }),
    );
  });

  it('should call onUpdate when updating team description', async () => {
    const onUpdate = vi.fn();
    render(<TeamCard team={baseTeam} agents={agents} onUpdate={onUpdate} />);

    await userEvent.click(screen.getByRole('button', { name: /edit team/i }));

    await userEvent.click(
      screen.getByRole('button', { name: /update description/i }),
    );

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'team-id', description: 'Updated description' }),
    );
  });

  it('should call onUpdate when updating team members with all available members', async () => {
    const onUpdate = vi.fn();
    render(<TeamCard team={baseTeam} agents={agents} onUpdate={onUpdate} />);

    await userEvent.click(screen.getByRole('button', { name: /edit team/i }));

    await userEvent.click(
      screen.getByRole('button', { name: /update members/i }),
    );

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'team-id',
        members: [
          { type: 'agent', name: 'agent1' },
          { type: 'agent', name: 'agent2' },
        ],
      }),
    );
  });

  it('should show unavailable member in editor and allow deleting only on update', async () => {
    const onUpdate = vi.fn();

    const teamWithUnavailable: Team = {
      ...baseTeam,
      members: [
        { type: 'agent', name: 'agent1' },
        { type: 'agent', name: 'missing-agent' },
      ],
    } as unknown as Team;

    render(<TeamCard team={teamWithUnavailable} agents={agents} onUpdate={onUpdate} />);

    await userEvent.click(screen.getByRole('button', { name: /edit team/i }));

    const editor = screen.getByTestId('team-editor');
    expect(editor).toBeInTheDocument();

    expect(onUpdate).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: /update members/i }),
    );

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'team-id',
        members: [
          { type: 'agent', name: 'agent1' },
          { type: 'agent', name: 'agent2' },
        ],
      }),
    );
  });

  it('should call onDelete with team id when delete is confirmed', async () => {
    const onDelete = vi.fn();
    render(<TeamCard team={baseTeam} agents={agents} onDelete={onDelete} />);

    await userEvent.click(screen.getByRole('button', { name: /delete team/i }));

    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Delete'));

    expect(onDelete).toHaveBeenCalledWith('team-id');
  });
});


