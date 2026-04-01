import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WarningsSection } from '@/components/forms/team-form/sections/warnings-section';
import type { TeamMember } from '@/lib/services';

const selectedMembers: TeamMember[] = [
  { name: 'agent-1', type: 'agent' },
  { name: 'agent-2', type: 'agent' },
];

describe('WarningsSection', () => {
  it('renders nothing when strategy is not selector', () => {
    const { container } = render(
      <WarningsSection
        selectedMembers={selectedMembers}
        strategy="sequential"
        enableTerminateTool={false}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when no members are selected', () => {
    const { container } = render(
      <WarningsSection
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
        selectedMembers={selectedMembers}
        strategy="selector"
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows warning when enableTerminateTool is false', () => {
    render(
      <WarningsSection
        selectedMembers={selectedMembers}
        strategy="selector"
        enableTerminateTool={false}
      />,
    );
    expect(
      screen.getByText(/The terminate tool is disabled/),
    ).toBeInTheDocument();
  });

  it('does not show warning based on agent tools', () => {
    render(
      <WarningsSection
        selectedMembers={selectedMembers}
        strategy="selector"
        enableTerminateTool={true}
      />,
    );
    expect(
      screen.queryByText(/terminate tool/),
    ).not.toBeInTheDocument();
  });
});
