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

  it('should not render for non-round-robin strategy', () => {
    const { container } = render(<StrategyIndicator strategy="selector" />);

    expect(container.firstChild).toBeNull();
  });

  it('should not render for graph strategy', () => {
    const { container } = render(<StrategyIndicator strategy="graph" />);

    expect(container.firstChild).toBeNull();
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
