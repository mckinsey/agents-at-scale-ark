import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';

const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollWidth',
);
const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientWidth',
);

function mockWidths(scrollWidth: number, clientWidth: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get: () => scrollWidth,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => clientWidth,
  });
}

afterEach(() => {
  if (scrollWidthDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollWidth',
      scrollWidthDescriptor,
    );
  }
  if (clientWidthDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'clientWidth',
      clientWidthDescriptor,
    );
  }
});

describe('TruncatedTooltip', () => {
  it('always renders the child content', () => {
    mockWidths(100, 100);
    render(
      <TruncatedTooltip label="Full description">
        <span className="block truncate">Visible text</span>
      </TruncatedTooltip>,
    );

    expect(screen.getByText('Visible text')).toBeInTheDocument();
  });

  it('shows the tooltip on hover when the text is truncated', async () => {
    const user = userEvent.setup();
    mockWidths(200, 100);
    render(
      <TruncatedTooltip label="Full description">
        <span className="block truncate">Visible text</span>
      </TruncatedTooltip>,
    );

    await user.hover(screen.getByText('Visible text'));

    await waitFor(() => {
      expect(screen.getAllByText('Full description').length).toBeGreaterThan(0);
    });
  });

  it('does not show the tooltip on hover when the text fits', async () => {
    const user = userEvent.setup();
    mockWidths(100, 100);
    render(
      <TruncatedTooltip label="Full description">
        <span className="block truncate">Visible text</span>
      </TruncatedTooltip>,
    );

    await user.hover(screen.getByText('Visible text'));

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.queryByText('Full description')).not.toBeInTheDocument();
  });
});
