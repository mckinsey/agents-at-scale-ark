import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SkillsDisplaySection } from './skills-display-section';

describe('SkillsDisplaySection', () => {
  it('shows the empty state when the agent has no skills', () => {
    render(<SkillsDisplaySection skills={[]} />);

    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(
      screen.getByText('No skills available for this agent'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('lists each skill with its description and tags', () => {
    render(
      <SkillsDisplaySection
        skills={[
          {
            id: 'math',
            name: 'Math',
            description: 'Solves arithmetic problems',
            tags: ['calculation', 'numbers'],
          },
          { id: 'echo', name: 'Echo' },
        ]}
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Math')).toBeInTheDocument();
    expect(screen.getByText('Solves arithmetic problems')).toBeInTheDocument();
    expect(screen.getByText('calculation')).toBeInTheDocument();
    expect(screen.getByText('numbers')).toBeInTheDocument();
    expect(screen.getByText('Echo')).toBeInTheDocument();
  });
});
