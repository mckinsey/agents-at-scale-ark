import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ApprovalNotification } from './approval-notification';

describe('ApprovalNotification', () => {
  const mockToolCalls = [
    {
      id: 'call-1',
      type: 'function',
      function: {
        name: 'write-file',
        arguments: '{"path": "/tmp/test.txt", "content": "test"}',
      },
    },
  ];

  const defaultProps = {
    queryName: 'test-query',
    queryNamespace: 'default',
    toolCalls: mockToolCalls,
    onApprove: vi.fn().mockResolvedValue(undefined),
    onReject: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders with tool call data', () => {
      render(<ApprovalNotification {...defaultProps} />);

      expect(screen.getByText('Approval Required')).toBeInTheDocument();
      expect(screen.getByText('write-file')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
    });

    it('displays agent name when provided', () => {
      render(<ApprovalNotification {...defaultProps} agentName="test-agent" />);

      expect(screen.getByText(/Agent: test-agent/i)).toBeInTheDocument();
    });

    it('displays timeout badge when timeout provided', () => {
      render(<ApprovalNotification {...defaultProps} timeout="5m" />);

      expect(screen.getByText(/Timeout: 5m/i)).toBeInTheDocument();
    });

    it('displays onTimeout policy when provided', () => {
      render(
        <ApprovalNotification
          {...defaultProps}
          timeout="5m"
          onTimeout="reject"
        />,
      );

      expect(screen.getByText(/Timeout: 5m \(reject\)/i)).toBeInTheDocument();
    });

    it('renders multiple tool calls correctly', () => {
      const multipleToolCalls = [
        ...mockToolCalls,
        {
          id: 'call-2',
          type: 'function',
          function: {
            name: 'delete-file',
            arguments: '{"path": "/tmp/delete.txt"}',
          },
        },
      ];

      render(
        <ApprovalNotification
          {...defaultProps}
          toolCalls={multipleToolCalls}
        />,
      );

      expect(screen.getByText('write-file')).toBeInTheDocument();
      expect(screen.getByText('delete-file')).toBeInTheDocument();
      expect(
        screen.getByText(/The following tools require your approval/i),
      ).toBeInTheDocument();
    });

    it('displays singular text for single tool', () => {
      render(<ApprovalNotification {...defaultProps} />);

      expect(
        screen.getByText(/The following tool requires your approval/i),
      ).toBeInTheDocument();
    });
  });

  describe('Tool Call Arguments', () => {
    it('tool call arguments are initially collapsed', () => {
      render(<ApprovalNotification {...defaultProps} />);

      const argumentsText = screen.queryByText(/"path":/);
      expect(argumentsText).not.toBeVisible();
    });

    it('expands tool call arguments when clicked', async () => {
      const user = userEvent.setup();
      render(<ApprovalNotification {...defaultProps} />);

      const detailsButton = screen.getByText(/View arguments/i);
      await user.click(detailsButton);

      await waitFor(() => {
        expect(screen.getByText(/"path":/)).toBeVisible();
      });
    });
  });

  describe('Button Actions', () => {
    it('triggers onApprove callback when approve button clicked', async () => {
      const user = userEvent.setup();
      const onApprove = vi.fn().mockResolvedValue(undefined);

      render(<ApprovalNotification {...defaultProps} onApprove={onApprove} />);

      const approveButton = screen.getByRole('button', { name: /approve/i });
      await user.click(approveButton);

      expect(onApprove).toHaveBeenCalledTimes(1);
    });

    it('triggers onReject callback when reject button clicked', async () => {
      const user = userEvent.setup();
      const onReject = vi.fn().mockResolvedValue(undefined);

      render(<ApprovalNotification {...defaultProps} onReject={onReject} />);

      const rejectButton = screen.getByRole('button', { name: /reject/i });
      await user.click(rejectButton);

      expect(onReject).toHaveBeenCalledTimes(1);
    });

    it('hides buttons when isSubmitting is true', async () => {
      const user = userEvent.setup();
      let resolveApprove: () => void;
      const approvePromise = new Promise<void>((resolve) => {
        resolveApprove = resolve;
      });
      const onApprove = vi.fn().mockReturnValue(approvePromise);

      render(<ApprovalNotification {...defaultProps} onApprove={onApprove} />);

      const approveButton = screen.getByRole('button', { name: /approve/i });

      await user.click(approveButton);

      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /approve/i }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: /reject/i }),
        ).not.toBeInTheDocument();
      });

      resolveApprove!();
    });
  });

  describe('Loading States', () => {
    it('shows approval loading message when approving', async () => {
      const user = userEvent.setup();
      let resolveApprove: () => void;
      const approvePromise = new Promise<void>((resolve) => {
        resolveApprove = resolve;
      });
      const onApprove = vi.fn().mockReturnValue(approvePromise);

      render(<ApprovalNotification {...defaultProps} onApprove={onApprove} />);

      await user.click(screen.getByRole('button', { name: /approve/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Approving and resuming execution/i),
        ).toBeInTheDocument();
      });

      resolveApprove!();
    });

    it('shows rejection loading message when rejecting', async () => {
      const user = userEvent.setup();
      let resolveReject: () => void;
      const rejectPromise = new Promise<void>((resolve) => {
        resolveReject = resolve;
      });
      const onReject = vi.fn().mockReturnValue(rejectPromise);

      render(<ApprovalNotification {...defaultProps} onReject={onReject} />);

      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/Rejecting and ending query/i),
        ).toBeInTheDocument();
      });

      resolveReject!();
    });

    it('shows green loading dots for approval', async () => {
      const user = userEvent.setup();
      let resolveApprove: () => void;
      const approvePromise = new Promise<void>((resolve) => {
        resolveApprove = resolve;
      });
      const onApprove = vi.fn().mockReturnValue(approvePromise);

      render(<ApprovalNotification {...defaultProps} onApprove={onApprove} />);

      await user.click(screen.getByRole('button', { name: /approve/i }));

      await waitFor(() => {
        const loadingContainer = screen.getByText(
          /Approving and resuming execution/i,
        ).parentElement?.parentElement;
        expect(loadingContainer?.className).toContain('bg-green');
      });

      resolveApprove!();
    });

    it('shows red loading dots for rejection', async () => {
      const user = userEvent.setup();
      let resolveReject: () => void;
      const rejectPromise = new Promise<void>((resolve) => {
        resolveReject = resolve;
      });
      const onReject = vi.fn().mockReturnValue(rejectPromise);

      render(<ApprovalNotification {...defaultProps} onReject={onReject} />);

      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        const loadingContainer = screen.getByText(
          /Rejecting and ending query/i,
        ).parentElement?.parentElement;
        expect(loadingContainer?.className).toContain('bg-red');
      });

      resolveReject!();
    });
  });

  describe('Decision States', () => {
    it('shows approved state with green checkmark after approval', async () => {
      const user = userEvent.setup();
      const onApprove = vi.fn().mockResolvedValue(undefined);

      render(<ApprovalNotification {...defaultProps} onApprove={onApprove} />);

      await user.click(screen.getByRole('button', { name: /approve/i }));

      await waitFor(() => {
        expect(screen.getByText(/Tool execution approved/i)).toBeInTheDocument();
      });

      const container = screen.getByText(/Tool execution approved/i)
        .parentElement?.parentElement;
      expect(container?.className).toContain('border-green');
    });

    it('shows rejected state with red X after rejection', async () => {
      const user = userEvent.setup();
      const onReject = vi.fn().mockResolvedValue(undefined);

      render(<ApprovalNotification {...defaultProps} onReject={onReject} />);

      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        expect(screen.getByText(/Tool execution rejected/i)).toBeInTheDocument();
      });

      const container = screen.getByText(/Tool execution rejected/i)
        .parentElement?.parentElement;
      expect(container?.className).toContain('border-red');
    });

    it('hides buttons after decision is made', async () => {
      const user = userEvent.setup();
      const onApprove = vi.fn().mockResolvedValue(undefined);

      render(<ApprovalNotification {...defaultProps} onApprove={onApprove} />);

      await user.click(screen.getByRole('button', { name: /approve/i }));

      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /approve/i }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: /reject/i }),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('re-enables buttons if approval fails', async () => {
      const user = userEvent.setup();
      const onApprove = vi.fn().mockRejectedValue(new Error('API error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<ApprovalNotification {...defaultProps} onApprove={onApprove} />);

      const approveButton = screen.getByRole('button', { name: /approve/i });
      await user.click(approveButton);

      await waitFor(() => {
        expect(approveButton).not.toBeDisabled();
      });

      consoleSpy.mockRestore();
    });

    it('re-enables buttons if rejection fails', async () => {
      const user = userEvent.setup();
      const onReject = vi.fn().mockRejectedValue(new Error('API error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<ApprovalNotification {...defaultProps} onReject={onReject} />);

      const rejectButton = screen.getByRole('button', { name: /reject/i });
      await user.click(rejectButton);

      await waitFor(() => {
        expect(rejectButton).not.toBeDisabled();
      });

      consoleSpy.mockRestore();
    });
  });
});
