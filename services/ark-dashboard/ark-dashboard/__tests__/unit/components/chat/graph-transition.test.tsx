import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GraphTransition } from '@/components/chat/graph-transition';

describe('GraphTransition', () => {
  it('should render agent names', () => {
    render(<GraphTransition from="agent-a" to="agent-b" />);

    expect(screen.getByText(/agent-a/)).toBeInTheDocument();
    expect(screen.getByText(/agent-b/)).toBeInTheDocument();
  });

  it('should render arrow between agent names', () => {
    render(<GraphTransition from="writer" to="reviewer" />);

    const text = screen.getByText(/writer/).textContent;
    expect(text).toContain('writer');
    expect(text).toContain('reviewer');
  });

  it('should apply custom className', () => {
    const { container } = render(
      <GraphTransition from="a" to="b" className="custom-class" />,
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });
});
