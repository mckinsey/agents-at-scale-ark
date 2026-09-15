import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JsonViewer } from '@/components/common/json-viewer';

describe('JsonViewer', () => {
  const sampleValue = { name: 'simple-team', type: 'team' };
  const prettyValue = JSON.stringify(sampleValue, null, 2);

  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders pretty-printed JSON in a pre tag', () => {
    const { container } = render(<JsonViewer value={sampleValue} />);
    const pre = container.querySelector('pre');
    expect(pre?.textContent).toBe(prettyValue);
  });

  it('renders copy and download buttons', () => {
    render(<JsonViewer value={sampleValue} />);
    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('copies the pretty-printed JSON to the clipboard', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(<JsonViewer value={sampleValue} />);

    await user.click(screen.getByText('Copy'));

    expect(writeText).toHaveBeenCalledWith(prettyValue);
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('downloads the JSON as a blob', async () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:test');
    const revokeObjectURLMock = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLMock;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock;

    const user = userEvent.setup();
    render(<JsonViewer value={sampleValue} fileName="my-response" />);

    await user.click(screen.getByText('Download'));

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:test');
  });

  it('unwraps a nested JSON string so it renders indented', () => {
    const value = {
      'kubectl.kubernetes.io/last-applied-configuration':
        '{"apiVersion":"ark.mckinsey.com/v1prealpha1","kind":"A2AServer"}',
    };

    const { container } = render(<JsonViewer value={value} />);

    expect(container.querySelector('pre')?.textContent).toBe(
      JSON.stringify(
        {
          'kubectl.kubernetes.io/last-applied-configuration': {
            apiVersion: 'ark.mckinsey.com/v1prealpha1',
            kind: 'A2AServer',
          },
        },
        null,
        2,
      ),
    );
  });

  it('unwraps nested JSON strings at any depth', () => {
    const value = { outer: '{"inner":"{\\"deep\\":1}"}' };

    const { container } = render(<JsonViewer value={value} />);

    expect(container.querySelector('pre')?.textContent).toBe(
      JSON.stringify({ outer: { inner: { deep: 1 } } }, null, 2),
    );
  });

  it('unwraps JSON strings inside arrays', () => {
    const value = { items: ['{"a":1}', 'plain'] };

    const { container } = render(<JsonViewer value={value} />);

    expect(container.querySelector('pre')?.textContent).toBe(
      JSON.stringify({ items: [{ a: 1 }, 'plain'] }, null, 2),
    );
  });

  it('leaves strings that only look numeric or boolean as strings', () => {
    const value = { port: '8080', enabled: 'true', timeout: '12h' };

    const { container } = render(<JsonViewer value={value} />);

    expect(container.querySelector('pre')?.textContent).toBe(
      JSON.stringify(value, null, 2),
    );
  });

  it('leaves a malformed JSON-looking string untouched', () => {
    const value = { broken: '{"a":' };

    const { container } = render(<JsonViewer value={value} />);

    expect(container.querySelector('pre')?.textContent).toBe(
      JSON.stringify(value, null, 2),
    );
  });

  it('renders a plain string value without adding quotes', () => {
    const { container } = render(<JsonViewer value="not json" />);

    expect(container.querySelector('pre')?.textContent).toBe('not json');
  });

  it('copies and downloads the original payload, not the display transform', async () => {
    const nested = { cfg: '{"kind":"A2AServer"}' };
    const rawText = JSON.stringify(nested, null, 2);
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const { container } = render(<JsonViewer value={nested} />);

    expect(container.querySelector('pre')?.textContent).toBe(
      JSON.stringify({ cfg: { kind: 'A2AServer' } }, null, 2),
    );

    await user.click(screen.getByText('Copy'));

    expect(writeText).toHaveBeenCalledWith(rawText);
  });

  it('serialises values through toJSON', () => {
    const value = { when: new Date('2026-09-02T09:17:16Z') };

    const { container } = render(<JsonViewer value={value} />);

    expect(container.querySelector('pre')?.textContent).toBe(
      JSON.stringify(value, null, 2),
    );
  });

  it('survives a cyclic payload', () => {
    const value: Record<string, unknown> = { name: 'loop' };
    value.self = value;

    const { container } = render(<JsonViewer value={value} />);

    expect(container.querySelector('pre')?.textContent).toBe('[object Object]');
  });

  it('truncates large payloads and expands on request', async () => {
    const user = userEvent.setup();
    render(<JsonViewer value={sampleValue} maxPreviewBytes={5} />);

    const pre = document.querySelector('pre');
    expect(pre?.textContent).toContain('truncated');
    expect(pre?.textContent).not.toBe(prettyValue);

    await user.click(screen.getByText('Load full'));

    expect(document.querySelector('pre')?.textContent).toBe(prettyValue);
    expect(screen.getByText('Show less')).toBeInTheDocument();
  });
});
