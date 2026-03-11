import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MaxTurnsEvent } from '@/components/chat/max-turns-event';

describe('MaxTurnsEvent', () => {
  it('should render default label when no message provided', () => {
    render(<MaxTurnsEvent />);
    expect(screen.getByText('Maximum turns reached')).toBeInTheDocument();
  });

  it('should extract turn count from message', () => {
    render(<MaxTurnsEvent message="Max turns reached (10)" />);
    expect(screen.getByText('Maximum turns reached (10)')).toBeInTheDocument();
  });

  it('should show default label when message has no number in parens', () => {
    render(<MaxTurnsEvent message="some other message" />);
    expect(screen.getByText('Maximum turns reached')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <MaxTurnsEvent className="custom-class" />,
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
