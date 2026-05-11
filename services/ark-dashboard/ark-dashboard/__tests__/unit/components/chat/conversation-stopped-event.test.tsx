import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConversationStoppedEvent } from '@/components/chat/conversation-stopped-event';

describe('ConversationStoppedEvent', () => {
  it('should render the stopped-by-user label', () => {
    render(<ConversationStoppedEvent />);
    expect(
      screen.getByText('Conversation stopped by user'),
    ).toBeInTheDocument();
  });

  it('should render the stop icon', () => {
    const { container } = render(<ConversationStoppedEvent />);
    const icon = container.querySelector('svg.lucide-square');
    expect(icon).not.toBeNull();
  });

  it('should apply the muted badge styling', () => {
    const { container } = render(<ConversationStoppedEvent />);
    const outer = container.firstChild as HTMLElement;
    expect(outer).toHaveClass(
      'flex',
      'items-center',
      'justify-center',
      'gap-2',
      'py-2',
    );
    const badge = outer.firstChild as HTMLElement;
    expect(badge).toHaveClass(
      'bg-muted/50',
      'rounded-full',
      'px-3',
      'py-1.5',
      'text-xs',
    );
  });
});
