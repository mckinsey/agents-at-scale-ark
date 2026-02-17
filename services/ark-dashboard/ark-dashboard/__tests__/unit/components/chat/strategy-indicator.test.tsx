import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StrategyIndicator } from '@/components/chat/strategy-indicator';

describe('StrategyIndicator', () => {
  it('should render for round-robin strategy', () => {
    render(<StrategyIndicator strategy="round-robin" />);

    expect(
      screen.getByText('Agents respond in round-robin order'),
    ).toBeInTheDocument();
  });

  it('should render for selector strategy with default name', () => {
    render(<StrategyIndicator strategy="selector" />);

    expect(
      screen.getByText('AI selector chooses each respondent'),
    ).toBeInTheDocument();
  });

  it('should render selector agent name when provided', () => {
    render(
      <StrategyIndicator
        strategy="selector"
        selectorAgentName="selector-agent"
      />,
    );

    expect(
      screen.getByText('selector-agent chooses each respondent'),
    ).toBeInTheDocument();
  });

  it('should render for graph strategy', () => {
    render(<StrategyIndicator strategy="graph" />);

    expect(
      screen.getByText('Agents respond following graph edges'),
    ).toBeInTheDocument();
  });

  it('should not render for sequential strategy', () => {
    const { container } = render(<StrategyIndicator strategy="sequential" />);

    expect(container.firstChild).toBeNull();
  });

  it('should not render when strategy is undefined', () => {
    const { container } = render(<StrategyIndicator strategy={undefined} />);

    expect(container.firstChild).toBeNull();
  });
});
