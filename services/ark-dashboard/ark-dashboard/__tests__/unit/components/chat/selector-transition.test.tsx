import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SelectorTransition } from '@/components/chat/selector-transition';

describe('SelectorTransition', () => {
  it('should render with default selector name', () => {
    render(<SelectorTransition agentName="research-agent" />);

    expect(
      screen.getByText(/Selector chose research-agent/),
    ).toBeInTheDocument();
  });

  it('should render with custom selector agent name', () => {
    render(
      <SelectorTransition
        agentName="research-agent"
        selectorAgentName="my-selector"
      />,
    );

    expect(
      screen.getByText('my-selector chose research-agent'),
    ).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <SelectorTransition agentName="agent-a" className="custom-class" />,
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });
});
