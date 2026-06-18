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
    taskId: 'task-123',
    toolCalls: mockToolCalls,
    onApprove: vi.fn().mockResolvedValue(undefined),
    onReject: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders tool call with function name', () => {
      render(<ApprovalNotification {...defaultProps} />);

      expect(screen.getByText('write-file')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
    });

    it('displays timeout when provided', () => {
      render(<ApprovalNotification {...defaultProps} timeout="5m" />);

      expect(screen.getByText('5m')).toBeInTheDocument();
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
    });

    it('shows buttons only on the last tool call', () => {
      const multipleToolCalls = [
        mockToolCalls[0],
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

      const approveButtons = screen.getAllByRole('button', { name: /approve/i });
      const rejectButtons = screen.getAllByRole('button', { name: /reject/i });

      // Only one set of buttons should be visible
      expect(approveButtons).toHaveLength(1);
      expect(rejectButtons).toHaveLength(1);
    });
  });

  describe('Tool Call Arguments', () => {
    it('tool call arguments are initially collapsed', () => {
      render(<ApprovalNotification {...defaultProps} />);

      const argumentsText = screen.queryByText(/"path":/);
      expect(argumentsText).not.toBeInTheDocument();
    });

    it('expands tool call arguments when Input is clicked', async () => {
      const user = userEvent.setup();
      render(<ApprovalNotification {...defaultProps} />);

      const inputButtons = screen.getAllByText('Input');
      await user.click(inputButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/"path":/)).toBeVisible();
      });
    });

    it('collapses arguments when Input is clicked again', async () => {
      const user = userEvent.setup();
      render(<ApprovalNotification {...defaultProps} />);

      const inputButtons = screen.getAllByText('Input');

      // Expand
      await user.click(inputButtons[0]);
      await waitFor(() => {
        expect(screen.getByText(/"path":/)).toBeVisible();
      });

      // Collapse
      await user.click(inputButtons[0]);
      await waitFor(() => {
        expect(screen.queryByText(/"path":/)).not.toBeInTheDocument();
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

    it('hides buttons while submitting', async () => {
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

  describe('Decision States', () => {
    it('hides buttons after approval', async () => {
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

    it('hides buttons after rejection', async () => {
      const user = userEvent.setup();
      const onReject = vi.fn().mockResolvedValue(undefined);

      render(<ApprovalNotification {...defaultProps} onReject={onReject} />);

      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /approve/i }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: /reject/i }),
        ).not.toBeInTheDocument();
      });
    });

    it('applies red styling after rejection', async () => {
      const user = userEvent.setup();
      const onReject = vi.fn().mockResolvedValue(undefined);

      render(<ApprovalNotification {...defaultProps} onReject={onReject} />);

      await user.click(screen.getByRole('button', { name: /reject/i }));

      await waitFor(() => {
        const toolName = screen.getByText('write-file');
        const card = toolName.closest('div.border');
        expect(card?.className).toContain('border-red');
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
        // Buttons should reappear after error
        expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
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
        // Buttons should reappear after error
        expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Existing Decision', () => {
    it('shows tool calls in read-only mode when existingDecision is approved', () => {
      render(
        <ApprovalNotification
          {...defaultProps}
          existingDecision="approved"
        />,
      );

      expect(screen.getByText('write-file')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /approve/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /reject/i }),
      ).not.toBeInTheDocument();
    });

    it('shows tool calls with red styling when existingDecision is rejected', () => {
      render(
        <ApprovalNotification
          {...defaultProps}
          existingDecision="rejected"
        />,
      );

      expect(screen.getByText('write-file')).toBeInTheDocument();
      const card = screen.getByText('write-file').closest('div.border');
      expect(card?.className).toContain('border-red');
    });
  });

  describe('Expired Approvals', () => {
    it('hides approve/reject buttons when expired', () => {
      render(<ApprovalNotification {...defaultProps} expired />);

      expect(screen.getByText('write-file')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /approve/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /reject/i }),
      ).not.toBeInTheDocument();
    });

    it('renders the Approval expired indicator when expired', () => {
      render(<ApprovalNotification {...defaultProps} expired />);

      expect(screen.getByText(/approval expired/i)).toBeInTheDocument();
    });

    it('applies amber styling when expired and no decision', () => {
      render(<ApprovalNotification {...defaultProps} expired />);

      const card = screen.getByText('write-file').closest('div.border');
      expect(card?.className).toContain('border-amber');
    });

    it('flips to expired automatically once expiresAtMs is reached', async () => {
      render(
        <ApprovalNotification
          {...defaultProps}
          expiresAtMs={Date.now() + 100}
        />,
      );

      // Before expiry: buttons still visible
      expect(
        screen.getByRole('button', { name: /approve/i }),
      ).toBeInTheDocument();

      await waitFor(
        () => {
          expect(
            screen.queryByRole('button', { name: /approve/i }),
          ).not.toBeInTheDocument();
          expect(screen.getByText(/approval expired/i)).toBeInTheDocument();
        },
        { timeout: 1000 },
      );
    });

    it('still shows decision state when expired-with-decision', () => {
      render(
        <ApprovalNotification
          {...defaultProps}
          expired
          existingDecision="approved"
        />,
      );

      // Decision wins: no expired indicator, no buttons
      expect(
        screen.queryByText(/approval expired/i),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /approve/i }),
      ).not.toBeInTheDocument();
    });

    it('invokes onExpired when the approval is already expired', () => {
      const onExpired = vi.fn();
      render(
        <ApprovalNotification
          {...defaultProps}
          expired
          onExpired={onExpired}
        />,
      );

      expect(onExpired).toHaveBeenCalledTimes(1);
    });

    it('invokes onExpired exactly once when expiresAtMs is reached', async () => {
      const onExpired = vi.fn();
      render(
        <ApprovalNotification
          {...defaultProps}
          expiresAtMs={Date.now() + 100}
          onExpired={onExpired}
        />,
      );

      await waitFor(
        () => {
          expect(onExpired).toHaveBeenCalled();
        },
        { timeout: 1000 },
      );
      // No duplicate firing on re-render.
      expect(onExpired).toHaveBeenCalledTimes(1);
    });

    it('does not invoke onExpired when a decision is already set', () => {
      const onExpired = vi.fn();
      render(
        <ApprovalNotification
          {...defaultProps}
          expired
          existingDecision="approved"
          onExpired={onExpired}
        />,
      );

      expect(onExpired).not.toHaveBeenCalled();
    });
  });
});
