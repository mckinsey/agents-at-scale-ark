import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MembersSection } from '@/components/forms/team-form/sections/members-section';
import type { Agent, TeamMember } from '@/lib/services';

const mockAgents: Agent[] = [
  { id: 'a1', name: 'agent-1', description: 'First agent' } as Agent,
  { id: 'a2', name: 'agent-2', description: 'Second agent' } as Agent,
  { id: 'a3', name: 'agent-3' } as Agent,
];

describe('MembersSection', () => {
  it('should render heading', () => {
    render(
      <MembersSection
        agents={mockAgents}
        selectedMembers={[]}
        unavailableMembers={[]}
        onMembersChange={vi.fn()}
        onDeleteUnavailable={vi.fn()}
      />,
    );
    expect(screen.getByText('Team Members')).toBeInTheDocument();
  });

  it('should display member count', () => {
    render(
      <MembersSection
        agents={mockAgents}
        selectedMembers={[{ name: 'agent-1', type: 'agent' }]}
        unavailableMembers={[]}
        onMembersChange={vi.fn()}
        onDeleteUnavailable={vi.fn()}
      />,
    );
    expect(screen.getByText('1 member selected')).toBeInTheDocument();
  });

  it('should display plural members count', () => {
    render(
      <MembersSection
        agents={mockAgents}
        selectedMembers={[
          { name: 'agent-1', type: 'agent' },
          { name: 'agent-2', type: 'agent' },
        ]}
        unavailableMembers={[]}
        onMembersChange={vi.fn()}
        onDeleteUnavailable={vi.fn()}
      />,
    );
    expect(screen.getByText('2 members selected')).toBeInTheDocument();
  });

  it('should render agent names', () => {
    render(
      <MembersSection
        agents={mockAgents}
        selectedMembers={[]}
        unavailableMembers={[]}
        onMembersChange={vi.fn()}
        onDeleteUnavailable={vi.fn()}
      />,
    );
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('agent-2')).toBeInTheDocument();
    expect(screen.getByText('agent-3')).toBeInTheDocument();
  });

  it('should render agent descriptions', () => {
    render(
      <MembersSection
        agents={mockAgents}
        selectedMembers={[]}
        unavailableMembers={[]}
        onMembersChange={vi.fn()}
        onDeleteUnavailable={vi.fn()}
      />,
    );
    expect(screen.getByText('First agent')).toBeInTheDocument();
    expect(screen.getByText('Second agent')).toBeInTheDocument();
  });

  it('should show checkboxes for each agent', () => {
    render(
      <MembersSection
        agents={mockAgents}
        selectedMembers={[]}
        unavailableMembers={[]}
        onMembersChange={vi.fn()}
        onDeleteUnavailable={vi.fn()}
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
  });

  it('should check selected members', () => {
    render(
      <MembersSection
        agents={mockAgents}
        selectedMembers={[{ name: 'agent-1', type: 'agent' }]}
        unavailableMembers={[]}
        onMembersChange={vi.fn()}
        onDeleteUnavailable={vi.fn()}
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it('should call onMembersChange when toggling a member on', async () => {
    const onMembersChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MembersSection
        agents={mockAgents}
        selectedMembers={[]}
        unavailableMembers={[]}
        onMembersChange={onMembersChange}
        onDeleteUnavailable={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);

    expect(onMembersChange).toHaveBeenCalledWith([
      { name: 'agent-1', type: 'agent' },
    ]);
  });

  it('should call onMembersChange when toggling a member off', async () => {
    const onMembersChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MembersSection
        agents={mockAgents}
        selectedMembers={[{ name: 'agent-1', type: 'agent' }]}
        unavailableMembers={[]}
        onMembersChange={onMembersChange}
        onDeleteUnavailable={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);

    expect(onMembersChange).toHaveBeenCalledWith([]);
  });

  it('should show unavailable members section when present', () => {
    const unavailableMembers: TeamMember[] = [
      { name: 'missing-agent', type: 'agent' },
    ];

    render(
      <MembersSection
        agents={mockAgents}
        selectedMembers={[{ name: 'missing-agent', type: 'agent' }]}
        unavailableMembers={unavailableMembers}
        onMembersChange={vi.fn()}
        onDeleteUnavailable={vi.fn()}
      />,
    );

    expect(screen.getByText('Unavailable Members')).toBeInTheDocument();
    expect(screen.getByText('missing-agent')).toBeInTheDocument();
  });

  it('should call onDeleteUnavailable when delete button is clicked', async () => {
    const onDeleteUnavailable = vi.fn();
    const unavailableMembers: TeamMember[] = [
      { name: 'missing-agent', type: 'agent' },
    ];
    const user = userEvent.setup();

    render(
      <MembersSection
        agents={mockAgents}
        selectedMembers={[{ name: 'missing-agent', type: 'agent' }]}
        unavailableMembers={unavailableMembers}
        onMembersChange={vi.fn()}
        onDeleteUnavailable={onDeleteUnavailable}
      />,
    );

    await user.click(screen.getByLabelText('Delete member'));

    expect(onDeleteUnavailable).toHaveBeenCalledWith({
      name: 'missing-agent',
      type: 'agent',
    });
  });

  it('should order selected members before unselected', () => {
    render(
      <MembersSection
        agents={mockAgents}
        selectedMembers={[{ name: 'agent-3', type: 'agent' }]}
        unavailableMembers={[]}
        onMembersChange={vi.fn()}
        onDeleteUnavailable={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
  });
});
