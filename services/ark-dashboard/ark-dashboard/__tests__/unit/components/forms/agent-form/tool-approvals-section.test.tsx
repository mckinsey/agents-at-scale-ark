import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolApprovalsSection } from '@/components/forms/agent-form/sections/tool-approvals-section';
import type { AgentTool, ToolApprovalConfig } from '@/lib/services';

const selectedTools: AgentTool[] = [{ type: 'custom', name: 'write-file' }];

describe('ToolApprovalsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no tools are selected', () => {
    const { container } = render(
      <ToolApprovalsSection
        selectedTools={[]}
        getToolApproval={() => undefined}
        onApprovalChange={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a require-approval toggle per selected tool, timeout hidden by default', () => {
    render(
      <ToolApprovalsSection
        selectedTools={selectedTools}
        getToolApproval={() => undefined}
        onApprovalChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Tool approvals')).toBeInTheDocument();
    expect(screen.getByLabelText('write-file')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g., 5m')).not.toBeInTheDocument();
  });

  it('enables approval when the toggle is checked', async () => {
    const onApprovalChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ToolApprovalsSection
        selectedTools={selectedTools}
        getToolApproval={() => undefined}
        onApprovalChange={onApprovalChange}
      />,
    );

    await user.click(screen.getByLabelText('write-file'));

    expect(onApprovalChange).toHaveBeenCalledWith('write-file', {
      required: true,
    });
  });

  it('reveals and round-trips timeout / onTimeout when approval is required', async () => {
    const approval: ToolApprovalConfig = {
      required: true,
      timeout: '5m',
      onTimeout: 'reject',
    };
    const onApprovalChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ToolApprovalsSection
        selectedTools={selectedTools}
        getToolApproval={() => approval}
        onApprovalChange={onApprovalChange}
      />,
    );

    const timeout = screen.getByPlaceholderText('e.g., 5m');
    expect(timeout).toHaveValue('5m');
    expect(screen.getByText('reject')).toBeInTheDocument();

    await user.type(timeout, 'x');
    expect(onApprovalChange).toHaveBeenCalledWith(
      'write-file',
      expect.objectContaining({ required: true, timeout: '5mx' }),
    );
  });

  it('clears approval when the toggle is unchecked', async () => {
    const onApprovalChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ToolApprovalsSection
        selectedTools={selectedTools}
        getToolApproval={() => ({ required: true })}
        onApprovalChange={onApprovalChange}
      />,
    );

    await user.click(screen.getByLabelText('write-file'));

    expect(onApprovalChange).toHaveBeenCalledWith('write-file', undefined);
  });
});
