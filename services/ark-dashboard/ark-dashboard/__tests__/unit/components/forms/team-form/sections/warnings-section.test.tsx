import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WarningsSection } from '@/components/forms/team-form/sections/warnings-section';
import type { Agent, TeamMember } from '@/lib/services';

const selectedMembers: TeamMember[] = [
  { name: 'agent-1', type: 'agent' },
  { name: 'agent-2', type: 'agent' },
];

const agentsWithoutTerminate: Agent[] = [
  { id: '1', name: 'agent-1', namespace: 'default', isA2A: false, tools: [{ type: 'inline', name: 'search' }] },
  { id: '2', name: 'agent-2', namespace: 'default', isA2A: false, tools: [{ type: 'inline', name: 'fetch' }] },
];

const agentsWithTerminate: Agent[] = [
  { id: '1', name: 'agent-1', namespace: 'default', isA2A: false, tools: [{ type: 'inline', name: 'terminate' }] },
  { id: '2', name: 'agent-2', namespace: 'default', isA2A: false, tools: [{ type: 'inline', name: 'fetch' }] },
];

const agentsWithNoTools: Agent[] = [
  { id: '1', name: 'agent-1', namespace: 'default', isA2A: false },
  { id: '2', name: 'agent-2', namespace: 'default', isA2A: false, tools: [] },
];

const agentsWithTerminateOnNonMember: Agent[] = [
  { id: '1', name: 'agent-1', namespace: 'default', isA2A: false, tools: [{ type: 'inline', name: 'search' }] },
  { id: '2', name: 'agent-2', namespace: 'default', isA2A: false, tools: [{ type: 'inline', name: 'fetch' }] },
  { id: '3', name: 'agent-3', namespace: 'default', isA2A: false, tools: [{ type: 'inline', name: 'terminate' }] },
];

describe('WarningsSection', () => {
  it('renders nothing when strategy is not selector', () => {
    const { container } = render(
      <WarningsSection
        agents={agentsWithoutTerminate}
        selectedMembers={selectedMembers}
        strategy="sequential"
        enableTerminateTool={false}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when strategy is graph', () => {
    const { container } = render(
      <WarningsSection
        agents={agentsWithoutTerminate}
        selectedMembers={selectedMembers}
        strategy="graph"
        enableTerminateTool={false}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when no members are selected', () => {
    const { container } = render(
      <WarningsSection
        agents={agentsWithoutTerminate}
        selectedMembers={[]}
        strategy="selector"
        enableTerminateTool={false}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when enableTerminateTool is true', () => {
    const { container } = render(
      <WarningsSection
        agents={agentsWithoutTerminate}
        selectedMembers={selectedMembers}
        strategy="selector"
        enableTerminateTool={true}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when enableTerminateTool is undefined', () => {
    const { container } = render(
      <WarningsSection
        agents={agentsWithoutTerminate}
        selectedMembers={selectedMembers}
        strategy="selector"
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when a member agent has the terminate tool', () => {
    const { container } = render(
      <WarningsSection
        agents={agentsWithTerminate}
        selectedMembers={selectedMembers}
        strategy="selector"
        enableTerminateTool={false}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when both enableTerminateTool is true and a member has terminate tool', () => {
    const { container } = render(
      <WarningsSection
        agents={agentsWithTerminate}
        selectedMembers={selectedMembers}
        strategy="selector"
        enableTerminateTool={true}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows warning when enableTerminateTool is false and no member has terminate tool', () => {
    render(
      <WarningsSection
        agents={agentsWithoutTerminate}
        selectedMembers={selectedMembers}
        strategy="selector"
        enableTerminateTool={false}
      />,
    );
    expect(
      screen.getByText(/Neither the agents nor the selector have access to the terminate tool/),
    ).toBeInTheDocument();
  });

  it('shows warning when agents have undefined or empty tools', () => {
    render(
      <WarningsSection
        agents={agentsWithNoTools}
        selectedMembers={selectedMembers}
        strategy="selector"
        enableTerminateTool={false}
      />,
    );
    expect(
      screen.getByText(/Neither the agents nor the selector have access to the terminate tool/),
    ).toBeInTheDocument();
  });

  it('shows warning when only a non-selected agent has the terminate tool', () => {
    render(
      <WarningsSection
        agents={agentsWithTerminateOnNonMember}
        selectedMembers={selectedMembers}
        strategy="selector"
        enableTerminateTool={false}
      />,
    );
    expect(
      screen.getByText(/Neither the agents nor the selector have access to the terminate tool/),
    ).toBeInTheDocument();
  });

  it('shows warning when selected member is not found in agents list', () => {
    const unknownMembers: TeamMember[] = [{ name: 'unknown-agent', type: 'agent' }];
    render(
      <WarningsSection
        agents={agentsWithTerminate}
        selectedMembers={unknownMembers}
        strategy="selector"
        enableTerminateTool={false}
      />,
    );
    expect(
      screen.getByText(/Neither the agents nor the selector have access to the terminate tool/),
    ).toBeInTheDocument();
  });
});
