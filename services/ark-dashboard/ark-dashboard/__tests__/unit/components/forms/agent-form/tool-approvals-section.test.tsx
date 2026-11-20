import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolApprovalsSection } from '@/components/forms/agent-form/sections/tool-approvals-section';
import type { AgentTool, ToolApprovalConfig } from '@/lib/services';

const selectedTools: AgentTool[] = [{ type: 'custom', name: 'write-file' }];

type SectionProps = ComponentProps<typeof ToolApprovalsSection>;

// Defaults model a tool with no Tool-CR approval: the effective config equals the
// agent-level config and nothing is enforced. Tests override these as needed.
function renderSection(
  props: Pick<SectionProps, 'getToolApproval'> & Partial<SectionProps>,
) {
  const {
    selectedTools: tools = selectedTools,
    getToolApproval,
    getEffectiveToolApproval = getToolApproval,
    isToolApprovalEnforced = () => false,
    onApprovalChange = vi.fn(),
    disabled,
  } = props;
  return render(
    <ToolApprovalsSection
      selectedTools={tools}
      getToolApproval={getToolApproval}
      getEffectiveToolApproval={getEffectiveToolApproval}
      isToolApprovalEnforced={isToolApprovalEnforced}
      onApprovalChange={onApprovalChange}
      disabled={disabled}
    />,
  );
}

describe('ToolApprovalsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no tools are selected', () => {
    const { container } = renderSection({
      selectedTools: [],
      getToolApproval: () => undefined,
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a require-approval toggle per selected tool, timeout hidden by default', () => {
    renderSection({ getToolApproval: () => undefined });
    expect(screen.getByText('Tool approvals')).toBeInTheDocument();
    expect(screen.getByLabelText('write-file')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('e.g., 5m')).not.toBeInTheDocument();
  });

  it('enables approval when the toggle is checked', async () => {
    const onApprovalChange = vi.fn();
    const user = userEvent.setup();
    renderSection({ getToolApproval: () => undefined, onApprovalChange });

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
    renderSection({ getToolApproval: () => approval, onApprovalChange });

    const timeout = screen.getByPlaceholderText('e.g., 5m');
    expect(timeout).toHaveValue('5m');
    expect(screen.getByText('reject')).toBeInTheDocument();

    await user.type(timeout, 'x');
    expect(onApprovalChange).toHaveBeenCalledWith(
      'write-file',
      expect.objectContaining({ required: true, timeout: '5mx' }),
    );
  });

  it('associates the timeout and on-timeout labels with their controls', () => {
    renderSection({
      getToolApproval: () => ({ required: true, timeout: '5m' }),
    });

    expect(screen.getByLabelText('Timeout')).toBe(
      screen.getByPlaceholderText('e.g., 5m'),
    );
    expect(screen.getByLabelText('On timeout')).toBeInTheDocument();
  });

  it('flags an invalid timeout and marks the input invalid', () => {
    renderSection({
      getToolApproval: () => ({ required: true, timeout: 'abc' }),
    });

    const timeout = screen.getByLabelText('Timeout');
    expect(timeout).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText('Enter a duration like 30s, 5m, or 1h30m.'),
    ).toBeInTheDocument();
  });

  it('accepts a compound duration without flagging it', () => {
    renderSection({
      getToolApproval: () => ({ required: true, timeout: '1h30m' }),
    });

    expect(screen.getByLabelText('Timeout')).toHaveAttribute(
      'aria-invalid',
      'false',
    );
    expect(
      screen.queryByText('Enter a duration like 30s, 5m, or 1h30m.'),
    ).not.toBeInTheDocument();
  });

  it('clears approval when the toggle is unchecked', async () => {
    const onApprovalChange = vi.fn();
    const user = userEvent.setup();
    renderSection({
      getToolApproval: () => ({ required: true }),
      onApprovalChange,
    });

    await user.click(screen.getByLabelText('write-file'));

    expect(onApprovalChange).toHaveBeenCalledWith('write-file', undefined);
  });

  describe('tool-level (CR) approval', () => {
    it('shows a Tool-gated tool as required even with no agent-level approval', () => {
      renderSection({
        getToolApproval: () => undefined,
        getEffectiveToolApproval: () => ({ required: true, timeout: '5m' }),
        isToolApprovalEnforced: () => true,
      });

      expect(screen.getByLabelText('write-file')).toBeChecked();
      expect(screen.getByText('Required by tool')).toBeInTheDocument();
      expect(screen.getByLabelText('Timeout')).toHaveValue('5m');
    });

    it('locks the checkbox so a Tool gate cannot be unset from the agent', async () => {
      const onApprovalChange = vi.fn();
      const user = userEvent.setup();
      renderSection({
        getToolApproval: () => undefined,
        getEffectiveToolApproval: () => ({ required: true }),
        isToolApprovalEnforced: () => true,
        onApprovalChange,
      });

      const checkbox = screen.getByLabelText('write-file');
      expect(checkbox).toBeDisabled();
      await user.click(checkbox);
      expect(onApprovalChange).not.toHaveBeenCalled();
    });

    it('persists a timeout override without writing required onto the agent spec', async () => {
      const onApprovalChange = vi.fn();
      const user = userEvent.setup();
      renderSection({
        getToolApproval: () => undefined,
        getEffectiveToolApproval: () => ({ required: true, timeout: '5m' }),
        isToolApprovalEnforced: () => true,
        onApprovalChange,
      });

      await user.type(screen.getByLabelText('Timeout'), 'x');

      expect(onApprovalChange).toHaveBeenCalledWith('write-file', {
        timeout: '5mx',
      });
    });

    it('shows the agent timeout override over the Tool default', () => {
      renderSection({
        getToolApproval: () => ({ timeout: '10m' }),
        getEffectiveToolApproval: () => ({ required: true, timeout: '10m' }),
        isToolApprovalEnforced: () => true,
      });

      expect(screen.getByLabelText('Timeout')).toHaveValue('10m');
    });
  });
});
