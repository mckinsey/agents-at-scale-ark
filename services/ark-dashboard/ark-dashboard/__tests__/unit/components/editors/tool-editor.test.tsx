import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolEditor } from '@/components/editors/tool-editor';

beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/components/common/agent-fields', () => ({
  AgentFields: () => <div data-testid="agent-fields">Agent Fields</div>,
}));

vi.mock('@/components/common/team-fields', () => ({
  TeamFields: () => <div data-testid="team-fields">Team Fields</div>,
}));

describe('ToolEditor', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSave: vi.fn(),
    namespace: 'default',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('should show error when name is empty on submit', async () => {
      const user = userEvent.setup();
      render(<ToolEditor {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error when type is not selected on submit', async () => {
      const user = userEvent.setup();
      render(<ToolEditor {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      await user.type(inputs[0], 'my-tool');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Type is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error when description is empty on submit', async () => {
      const user = userEvent.setup();
      render(<ToolEditor {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      await user.type(inputs[0], 'my-tool');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Description is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });
  });

  describe('form display', () => {
    it('should display name field', async () => {
      render(<ToolEditor {...defaultProps} />);

      expect(screen.getByText(/^Name/)).toBeInTheDocument();
    });

    it('should display type field', async () => {
      render(<ToolEditor {...defaultProps} />);

      expect(screen.getByText(/^Type/)).toBeInTheDocument();
    });

    it('should display description field', async () => {
      render(<ToolEditor {...defaultProps} />);

      expect(screen.getByText(/^Description/)).toBeInTheDocument();
    });

    it('should have create button', async () => {
      render(<ToolEditor {...defaultProps} />);

      expect(
        screen.getByRole('button', { name: /create/i }),
      ).toBeInTheDocument();
    });

    it('should have cancel button', async () => {
      render(<ToolEditor {...defaultProps} />);

      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).toBeInTheDocument();
    });
  });

  describe('dialog behavior', () => {
    it('should call onOpenChange when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<ToolEditor {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

