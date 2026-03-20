import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SelectorFailureEvent } from '@/components/chat/selector-failure-event';

describe('SelectorFailureEvent', () => {
  it('should render with extracted agent name from message', () => {
    const message = 'Selector returned invalid agent name: invalid-agent-123';
    render(<SelectorFailureEvent message={message} />);

    expect(screen.getByText(/Selector returned invalid agent: invalid-agent-123\. Ending conversation/i)).toBeInTheDocument();
  });

  it('should render default text when selectedName cannot be extracted', () => {
    const message = 'Some other message';
    render(<SelectorFailureEvent message={message} />);

    expect(screen.getByText(/Selector returned invalid agent: unknown\. Ending conversation/i)).toBeInTheDocument();
  });

  it('should handle message without agent name', () => {
    render(<SelectorFailureEvent />);

    expect(screen.getByText(/Selector returned invalid agent: unknown\. Ending conversation/i)).toBeInTheDocument();
  });

  it('should extract agent name with special characters', () => {
    const message = 'Selector returned invalid agent name: agent-name_with-special.chars';
    render(<SelectorFailureEvent message={message} />);

    expect(screen.getByText(/Selector returned invalid agent: agent-name_with-special\.chars\. Ending conversation/i)).toBeInTheDocument();
  });

  it('should extract agent name when followed by punctuation', () => {
    const message = 'Selector returned invalid agent name: my-agent';
    render(<SelectorFailureEvent message={message} />);

    expect(screen.getByText(/Selector returned invalid agent: my-agent\. Ending conversation/i)).toBeInTheDocument();
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
