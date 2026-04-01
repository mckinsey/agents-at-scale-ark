import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { McpEditor } from '@/components/editors/mcp-editor';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/services', () => ({
  mcpServersService: {
    get: vi.fn().mockResolvedValue(null),
  },
  secretsService: {
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

describe('McpEditor', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSave: vi.fn(),
    mcpServer: null,
    namespace: 'default',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const getFormInputs = () => {
    const inputs = screen.getAllByRole('textbox');
    return {
      nameInput: inputs[0],
      descInput: inputs[1],
      urlInput: inputs[2],
    };
  };

  describe('validation', () => {
    it('should show error when name is empty on submit', async () => {
      const user = userEvent.setup();
      render(<McpEditor {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error when description is empty on submit', async () => {
      const user = userEvent.setup();
      render(<McpEditor {...defaultProps} />);

      const { nameInput } = getFormInputs();
      await user.type(nameInput, 'valid-name');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Description is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error when URL is empty on submit', async () => {
      const user = userEvent.setup();
      render(<McpEditor {...defaultProps} />);

      const { nameInput, descInput } = getFormInputs();
      await user.type(nameInput, 'valid-name');
      await user.type(descInput, 'Valid description');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('URL is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error for invalid kubernetes name', async () => {
      const user = userEvent.setup();
      render(<McpEditor {...defaultProps} />);

      const { nameInput } = getFormInputs();
      await user.type(nameInput, 'invalidName');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(
          screen.getByText(
            'Name can only contain lowercase letters, numbers, hyphens, and dots',
          ),
        ).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });
  });

  describe('form display', () => {
    it('should display all required fields', async () => {
      render(<McpEditor {...defaultProps} />);

      expect(screen.getByText(/^Name/)).toBeInTheDocument();
      expect(screen.getByText(/^Description/)).toBeInTheDocument();
      expect(screen.getByText(/^URL/)).toBeInTheDocument();
      expect(screen.getByText(/^Transport/)).toBeInTheDocument();
    });

    it('should have create button', async () => {
      render(<McpEditor {...defaultProps} />);

      expect(
        screen.getByRole('button', { name: /create/i }),
      ).toBeInTheDocument();
    });
  });

  describe('transport selection', () => {
    it('should display transport label', async () => {
      render(<McpEditor {...defaultProps} />);

      expect(screen.getByText('Transport')).toBeInTheDocument();
    });
  });

  describe('edit mode', () => {
    const existingServer = {
      id: 'mcp-1',
      name: 'existing-mcp',
      namespace: 'default',
      description: 'Existing server',
    };

    it('should disable name field when editing', async () => {
      render(<McpEditor {...defaultProps} mcpServer={existingServer} />);

      const { nameInput } = getFormInputs();
      expect(nameInput).toBeDisabled();
    });

    it('should show Update button when editing', async () => {
      render(<McpEditor {...defaultProps} mcpServer={existingServer} />);

      expect(
        screen.getByRole('button', { name: /update/i }),
      ).toBeInTheDocument();
    });
  });

  describe('dialog behavior', () => {
    it('should call onOpenChange when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<McpEditor {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
