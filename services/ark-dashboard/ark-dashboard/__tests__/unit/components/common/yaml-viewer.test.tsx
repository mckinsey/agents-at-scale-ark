import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { YamlViewer } from '@/components/common/yaml-viewer';

describe('YamlViewer', () => {
  const sampleYaml = 'apiVersion: v1\nkind: ConfigMap';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render yaml content in a pre tag', () => {
    const { container } = render(<YamlViewer yaml={sampleYaml} />);
    const pre = container.querySelector('pre');
    expect(pre).toBeInTheDocument();
    expect(pre?.textContent).toBe(sampleYaml);
  });

  it('should render copy and download buttons', () => {
    render(<YamlViewer yaml={sampleYaml} />);
    expect(screen.getByText('Copy')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('should handle copy button click', async () => {
    const user = userEvent.setup();
    render(<YamlViewer yaml={sampleYaml} />);
    await user.click(screen.getByText('Copy'));
  });

  it('should handle download button click', async () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:test');
    const revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    const user = userEvent.setup();
    render(<YamlViewer yaml={sampleYaml} fileName="my-resource" />);
    await user.click(screen.getByText('Download'));

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:test');
  });

  it('should use default fileName when not provided', () => {
    render(<YamlViewer yaml={sampleYaml} />);
    expect(screen.getByText('Download')).toBeInTheDocument();
  });
});
