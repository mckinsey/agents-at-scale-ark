import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WarningsSection } from '@/components/forms/team-form/sections/warnings-section';
import type { Agent, TeamMember } from '@/lib/services';

const selectedMembers: TeamMember[] = [
  { name: 'agent-1', type: 'agent' },
  { name: 'agent-2', type: 'agent' },
];

function makeAgent(name: string, hasTerminate = false): Agent {
  return {
    id: name,
    name,
    tools: hasTerminate
      ? [{ type: 'builtin', name: 'terminate' }]
      : [],
  } as unknown as Agent;
}

describe('WarningsSection', () => {
  it('renders nothing when strategy is not selector', () => {
    const { container } = render(
      <WarningsSection
        agents={[makeAgent('agent-1')]}
        selectedMembers={selectedMembers}
        strategy="sequential"
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when no members are selected', () => {
    const { container } = render(
      <WarningsSection
        agents={[makeAgent('agent-1')]}
        selectedMembers={[]}
        strategy="selector"
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when all warnings are absent', () => {
    const agents = [makeAgent('agent-1', true), makeAgent('agent-2', true)];
    const { container } = render(
      <WarningsSection
        agents={agents}
        selectedMembers={selectedMembers}
        strategy="selector"
        selectorAgent="agent-1"
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows warning when no agent has the terminate tool', () => {
    const agents = [makeAgent('agent-1'), makeAgent('agent-2')];
    render(
      <WarningsSection
        agents={agents}
        selectedMembers={selectedMembers}
        strategy="selector"
      />,
    );
    expect(
      screen.getByText(/No agent in this team has the terminate tool/),
    ).toBeInTheDocument();
  });

  it('shows warning when selector agent lacks terminate', () => {
    const agents = [makeAgent('agent-1'), makeAgent('agent-2', true)];
    render(
      <WarningsSection
        agents={agents}
        selectedMembers={selectedMembers}
        strategy="selector"
        selectorAgent="agent-1"
      />,
    );
    expect(
      screen.getByText(/The selector agent does not have the terminate tool/),
    ).toBeInTheDocument();
  });

  it('shows both warnings when no agent has terminate and selector is set', () => {
    const agents = [makeAgent('agent-1'), makeAgent('agent-2')];
    render(
      <WarningsSection
        agents={agents}
        selectedMembers={selectedMembers}
        strategy="selector"
        selectorAgent="agent-1"
      />,
    );
    expect(
      screen.getByText(/No agent in this team has the terminate tool/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The selector agent does not have the terminate tool/),
    ).toBeInTheDocument();
  });

  it('does not show selector warning when selectorAgent is __none__', () => {
    const agents = [makeAgent('agent-1'), makeAgent('agent-2')];
    render(
      <WarningsSection
        agents={agents}
        selectedMembers={selectedMembers}
        strategy="selector"
        selectorAgent="__none__"
      />,
    );
    expect(
      screen.queryByText(/The selector agent does not have the terminate tool/),
    ).not.toBeInTheDocument();
  });

  it('does not show no-terminate warning when at least one agent has terminate', () => {
    const agents = [makeAgent('agent-1', true), makeAgent('agent-2')];
    render(
      <WarningsSection
        agents={agents}
        selectedMembers={selectedMembers}
        strategy="selector"
      />,
    );
    expect(
      screen.queryByText(/No agent in this team has the terminate tool/),
    ).not.toBeInTheDocument();
  });
});
