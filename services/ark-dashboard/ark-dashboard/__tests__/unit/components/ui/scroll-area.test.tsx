import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ScrollArea } from '@/components/ui/scroll-area';

describe('ScrollArea', () => {
  it('wires onViewportScroll to the Radix viewport, not the root', () => {
    const onViewportScroll = vi.fn();
    const { container } = render(
      <ScrollArea onViewportScroll={onViewportScroll}>
        <div style={{ height: 1000 }}>content</div>
      </ScrollArea>,
    );

    const viewport = container.querySelector(
      '[data-slot="scroll-area-viewport"]',
    );
    expect(viewport).not.toBeNull();

    fireEvent.scroll(viewport as Element);
    expect(onViewportScroll).toHaveBeenCalledTimes(1);

    // Sanity check: scrolling the root should NOT invoke the handler
    // (scroll doesn't bubble in React), which is the exact reason the
    // handler must live on the viewport.
    const root = container.querySelector('[data-slot="scroll-area"]');
    expect(root).not.toBeNull();
    onViewportScroll.mockClear();
    fireEvent.scroll(root as Element);
    expect(onViewportScroll).not.toHaveBeenCalled();
  });
});
