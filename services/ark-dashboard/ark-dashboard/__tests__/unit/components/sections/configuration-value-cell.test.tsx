import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { ConfigurationValueCell } from '@/components/sections/configuration-value-cell';
import type { ConfigurationDetailResponse } from '@/lib/services/configurations';

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

const YAML_VALUE = `mcpServers:
  weather:
    url: https://mcp.example.com/sse
    transport: sse`;

const PREVIEW =
  'mcpServers: weather: url: https://mcp.example.com/sse transport: sse';

const configuration = (
  overrides: Partial<ConfigurationDetailResponse> = {},
): ConfigurationDetailResponse => ({
  id: 'mcp-config',
  name: 'mcp-config',
  value: YAML_VALUE,
  labels: [],
  ...overrides,
});

describe('ConfigurationValueCell', () => {
  it('previews a multi-line value on a single line', () => {
    mockWidths(100, 100);
    render(<ConfigurationValueCell configuration={configuration()} />);

    expect(screen.getByText(PREVIEW)).toBeInTheDocument();
  });

  it('reveals the full value on hover when the preview is truncated', async () => {
    const user = userEvent.setup();
    mockWidths(600, 240);
    render(<ConfigurationValueCell configuration={configuration()} />);

    await user.hover(screen.getByText(PREVIEW));

    await waitFor(() => {
      expect(screen.getAllByText(PREVIEW).length).toBeGreaterThan(1);
    });

    const tooltip = await screen.findByRole('tooltip');

    expect(tooltip.textContent).toContain(YAML_VALUE);
  });

  it('does not open a tooltip when the value fits', async () => {
    const user = userEvent.setup();
    mockWidths(100, 100);
    render(
      <ConfigurationValueCell
        configuration={configuration({ value: 'https://mcp.example.com' })}
      />,
    );

    await user.hover(screen.getByText('https://mcp.example.com'));

    expect(screen.getAllByText('https://mcp.example.com')).toHaveLength(1);
  });

  it('clamps a very long value in the tooltip', async () => {
    const user = userEvent.setup();
    mockWidths(6000, 240);
    const value = 'a'.repeat(900);
    render(<ConfigurationValueCell configuration={configuration({ value })} />);

    await user.hover(screen.getByText(value));

    const tooltip = await screen.findByRole('tooltip');

    expect(tooltip.textContent).toBe(`${'a'.repeat(600)}…`);
  });

  it('clamps a value with many lines in the tooltip', async () => {
    const user = userEvent.setup();
    mockWidths(6000, 240);
    const lines = Array.from({ length: 20 }, (_, index) => `line-${index}`);
    render(
      <ConfigurationValueCell
        configuration={configuration({ value: lines.join('\n') })}
      />,
    );

    await user.hover(screen.getByText(lines.join(' ')));

    const tooltip = await screen.findByRole('tooltip');

    expect(tooltip.textContent).toBe(`${lines.slice(0, 12).join('\n')}\n…`);
  });

  it('renders a dash when there is no value', () => {
    render(
      <ConfigurationValueCell configuration={configuration({ value: '' })} />,
    );

    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
