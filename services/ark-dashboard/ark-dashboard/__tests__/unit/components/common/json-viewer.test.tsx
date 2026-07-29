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
