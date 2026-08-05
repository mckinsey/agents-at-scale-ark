import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { AliasedNameCell } from '@/components/sections/aliased-name-cell';

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

const LONG_ALIAS =
  'mcp-server-url-for-the-shared-production-environment-eu-west';

describe('AliasedNameCell', () => {
  it('shows the name with the alias underneath', () => {
    mockWidths(100, 100);
    render(
      <AliasedNameCell resource={{ name: 'mcp-url-prod', alias: 'mcp-url' }} />,
    );

    expect(screen.getByText('mcp-url-prod')).toBeInTheDocument();
    expect(screen.getByText('Alias: mcp-url')).toBeInTheDocument();
  });

  it('shows only the name when there is no alias', () => {
    mockWidths(100, 100);
    render(<AliasedNameCell resource={{ name: 'model-timeout' }} />);

    expect(screen.getByText('model-timeout')).toBeInTheDocument();
    expect(screen.queryByText(/^Alias:/)).not.toBeInTheDocument();
  });

  it('reveals the full alias on hover when it is truncated', async () => {
    const user = userEvent.setup();
    mockWidths(400, 100);
    render(
      <AliasedNameCell
        resource={{ name: 'mcp-url-prod', alias: LONG_ALIAS }}
      />,
    );

    await user.hover(screen.getByText(`Alias: ${LONG_ALIAS}`));

    await waitFor(() => {
      expect(screen.getAllByText(LONG_ALIAS).length).toBeGreaterThan(0);
    });

    const tooltip = await screen.findByRole('tooltip');

    expect(tooltip.textContent).toBe(LONG_ALIAS);
  });

  it('reveals the full name on hover when it is truncated', async () => {
    const user = userEvent.setup();
    mockWidths(400, 100);
    render(
      <AliasedNameCell
        resource={{ name: 'mcp-server-url-for-the-shared-production-eu-west' }}
      />,
    );

    await user.hover(
      screen.getByText('mcp-server-url-for-the-shared-production-eu-west'),
    );

    const tooltip = await screen.findByRole('tooltip');

    expect(tooltip.textContent).toBe(
      'mcp-server-url-for-the-shared-production-eu-west',
    );
  });

  it('does not open a tooltip when the name fits', async () => {
    const user = userEvent.setup();
    mockWidths(100, 100);
    render(
      <AliasedNameCell resource={{ name: 'mcp-url-prod', alias: 'mcp-url' }} />,
    );

    await user.hover(screen.getByText('mcp-url-prod'));

    expect(screen.getAllByText('mcp-url-prod')).toHaveLength(1);
  });
});
