import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamRow } from '@/components/rows/team-row';
import type { Agent, Team } from '@/lib/services';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => '/teams'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/lib/chat-context', () => ({
  useChatState: () => ({
    isOpen: vi.fn(() => false),
  }),
}));

vi.mock('@/lib/chat-events', () => ({
  toggleFloatingChat: vi.fn(),
}));

vi.mock('@/components/ui/availability-status-badge', () => ({
  AvailabilityStatusBadge: vi.fn(({ status }) => (
    <span data-testid="availability-badge">
      {status ? 'Available' : 'Unavailable'}
    </span>
  )),
}));

vi.mock('@/components/dialogs/confirmation-dialog', () => ({
  ConfirmationDialog: vi.fn(
    ({
      open,
      onConfirm,
      confirmText,
    }: {
      open: boolean;
      onConfirm: () => void;
      confirmText: string;
    }) =>
      open ? (
        <div data-testid="confirmation-dialog">
          <button onClick={onConfirm}>{confirmText}</button>
        </div>
      ) : null,
  ),
}));

describe('TeamRow', () => {
  const mockAgents: Agent[] = [
    { id: 'a1', name: 'agent-1' } as Agent,
    { id: 'a2', name: 'agent-2' } as Agent,
  ];

  const baseTeam: Team = {
    id: 'team-1',
    name: 'my-team',
    description: 'A test team',
    strategy: 'sequential',
    members: [
      { name: 'agent-1', type: 'agent' },
      { name: 'agent-2', type: 'agent' },
    ],
    available: true,
  } as unknown as Team;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render team name and description', () => {
    render(<TeamRow team={baseTeam} agents={mockAgents} />);
    expect(screen.getByText('my-team')).toBeInTheDocument();
    expect(screen.getByText('A test team')).toBeInTheDocument();
  });

  it('should show "No description" when description is empty', () => {
    const team = { ...baseTeam, description: '' } as unknown as Team;
    render(<TeamRow team={team} agents={mockAgents} />);
    expect(screen.getByText('No description')).toBeInTheDocument();
  });

  it('should display member count and strategy', () => {
    render(<TeamRow team={baseTeam} agents={mockAgents} />);
    expect(screen.getByText(/2 members · Sequential/)).toBeInTheDocument();
  });

  it('should display singular member for count of 1', () => {
    const team = {
      ...baseTeam,
      members: [{ name: 'agent-1', type: 'agent' }],
    } as unknown as Team;
    render(<TeamRow team={team} agents={mockAgents} />);
    expect(screen.getByText(/1 member · Sequential/)).toBeInTheDocument();
  });

  it('should display correct strategy names', () => {
    const strategies = [
      { value: 'selector', display: 'Selector' },
      { value: 'graph', display: 'Graph' },
      { value: 'sequential', display: 'Sequential' },
    ];

    for (const { value, display } of strategies) {
      const team = { ...baseTeam, strategy: value } as unknown as Team;
      const { unmount } = render(<TeamRow team={team} agents={mockAgents} />);
      expect(screen.getByText(new RegExp(display))).toBeInTheDocument();
      unmount();
    }
  });

  it('should display "No strategy" when strategy is empty', () => {
    const team = {
      ...baseTeam,
      strategy: undefined,
    } as unknown as Team;
    render(<TeamRow team={team} agents={mockAgents} />);
    expect(screen.getByText(/No strategy/)).toBeInTheDocument();
  });

  it('should navigate to team page on row click', async () => {
    const user = userEvent.setup();
    render(<TeamRow team={baseTeam} agents={mockAgents} />);

    await user.click(screen.getByRole('link'));
    expect(mockPush).toHaveBeenCalledWith('/teams/my-team');
  });

  it('should navigate on Enter key', async () => {
    const user = userEvent.setup();
    render(<TeamRow team={baseTeam} agents={mockAgents} />);

    const row = screen.getByRole('link');
    row.focus();
    await user.keyboard('{Enter}');
    expect(mockPush).toHaveBeenCalledWith('/teams/my-team');
  });

  it('should navigate on Space key', async () => {
    const user = userEvent.setup();
    render(<TeamRow team={baseTeam} agents={mockAgents} />);

    const row = screen.getByRole('link');
    row.focus();
    await user.keyboard(' ');
    expect(mockPush).toHaveBeenCalledWith('/teams/my-team');
  });

  it('should show delete button when onDelete is provided', () => {
    render(
      <TeamRow team={baseTeam} agents={mockAgents} onDelete={vi.fn()} />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('should open delete confirmation dialog on delete click', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <TeamRow team={baseTeam} agents={mockAgents} onDelete={onDelete} />,
    );

    const deleteButton = screen.getAllByRole('button')[1];
    await user.click(deleteButton);

    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
  });

  it('should call onDelete when delete is confirmed', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <TeamRow team={baseTeam} agents={mockAgents} onDelete={onDelete} />,
    );

    const deleteButton = screen.getAllByRole('button')[1];
    await user.click(deleteButton);

    await user.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith('team-1');
  });

  it('should show chat button when team has members', async () => {
    const { toggleFloatingChat } = await import('@/lib/chat-events');
    const user = userEvent.setup();
    render(<TeamRow team={baseTeam} agents={mockAgents} />);

    const buttons = screen.getAllByRole('button');
    const chatButton = buttons[buttons.length - 1];
    await user.click(chatButton);

    expect(toggleFloatingChat).toHaveBeenCalledWith(
      'my-team',
      'team',
      'sequential',
      undefined,
    );
  });

  it('should not show chat button when team has no members', () => {
    const team = {
      ...baseTeam,
      members: [],
    } as unknown as Team;
    render(<TeamRow team={team} agents={mockAgents} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(1);
  });

  it('should render availability badge', () => {
    render(<TeamRow team={baseTeam} agents={mockAgents} />);
    expect(screen.getByTestId('availability-badge')).toBeInTheDocument();
  });
});
