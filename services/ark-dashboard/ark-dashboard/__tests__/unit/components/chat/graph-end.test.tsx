import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GraphEnd } from '@/components/chat/graph-end';

describe('GraphEnd', () => {
  it('should render "Conversation ended because agent graph has no outgoing edges"', () => {
    render(<GraphEnd />);

    expect(screen.getByText('Conversation ended because agent graph has no outgoing edges')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(<GraphEnd className="custom-class" />);

    expect(container.firstChild).toHaveClass('custom-class');
  });
});
