import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GraphEnd } from '@/components/chat/graph-end';

describe('GraphEnd', () => {
  it('should render "End of graph"', () => {
    render(<GraphEnd />);

    expect(screen.getByText('End of graph')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(<GraphEnd className="custom-class" />);

    expect(container.firstChild).toHaveClass('custom-class');
  });
});
