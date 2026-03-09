import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SelectorFailureEvent } from '@/components/chat/selector-failure-event';

describe('SelectorFailureEvent', () => {
  it('should render with extracted agent name from message', () => {
    const message = 'Selector did not choose valid agent: returned invalid-agent-123';
    render(<SelectorFailureEvent message={message} />);

    expect(screen.getByText(/Selector returned invalid agent: invalid-agent-123/i)).toBeInTheDocument();
  });

  it('should render default text when selectedName cannot be extracted', () => {
    const message = 'Some other message';
    render(<SelectorFailureEvent message={message} />);

    expect(screen.getByText(/Selector returned invalid agent: unknown/i)).toBeInTheDocument();
  });

  it('should handle message without agent name', () => {
    render(<SelectorFailureEvent />);

    expect(screen.getByText(/Selector returned invalid agent: unknown/i)).toBeInTheDocument();
  });

  it('should extract agent name with special characters', () => {
    const message = 'Selector did not choose valid agent: returned agent-name_with-special.chars';
    render(<SelectorFailureEvent message={message} />);

    expect(screen.getByText(/Selector returned invalid agent: agent-name_with-special\.chars/i)).toBeInTheDocument();
  });

  it('should extract agent name when followed by punctuation', () => {
    const message = 'Selector did not choose valid agent: returned my-agent.';
    render(<SelectorFailureEvent message={message} />);

    expect(screen.getByText(/Selector returned invalid agent: my-agent/i)).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <SelectorFailureEvent message="test" className="custom-class" />
    );

    const wrapper = container.querySelector('.custom-class');
    expect(wrapper).toBeInTheDocument();
  });

  it('should render with warning icon', () => {
    const { container } = render(<SelectorFailureEvent message="test" />);

    const icon = container.querySelector('.lucide-triangle-alert');
    expect(icon).toBeInTheDocument();
  });
});
