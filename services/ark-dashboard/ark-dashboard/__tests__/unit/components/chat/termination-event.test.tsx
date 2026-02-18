import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TerminationEvent } from '@/components/chat/termination-event';

describe('TerminationEvent', () => {
  it('should render termination message with agent name', () => {
    render(<TerminationEvent agentName="test-agent" />);

    expect(
      screen.getByText(
        /test-agent has terminated the conversation with the following message/,
      ),
    ).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <TerminationEvent agentName="agent-1" className="custom-class" />,
    );

    const element = container.querySelector('.custom-class');
    expect(element).toBeInTheDocument();
  });

  it('should display termination for different agent names', () => {
    const { rerender } = render(<TerminationEvent agentName="agent-alpha" />);

    expect(
      screen.getByText(
        /agent-alpha has terminated the conversation with the following message/,
      ),
    ).toBeInTheDocument();

    rerender(<TerminationEvent agentName="agent-beta" />);

    expect(
      screen.getByText(
        /agent-beta has terminated the conversation with the following message/,
      ),
    ).toBeInTheDocument();
  });

  it('should have correct styling classes', () => {
    const { container } = render(<TerminationEvent agentName="test" />);

    const element = container.firstChild as HTMLElement;
    expect(element).toHaveClass('text-muted-foreground');
    expect(element).toHaveClass('text-sm');
    expect(element).toHaveClass('italic');
  });
});
