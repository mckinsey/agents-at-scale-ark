import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NamespaceEditor } from '@/components/editors/namespace-editor';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('NamespaceEditor', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSave: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('should show error when name is empty on submit', async () => {
      const user = userEvent.setup();
      render(<NamespaceEditor {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error for name starting with hyphen', async () => {
      const user = userEvent.setup();
      render(<NamespaceEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('my-namespace');
      await user.type(nameInput, '-invalid-name');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(
          screen.getByText('Name must start with a lowercase letter or number'),
        ).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error for name ending with hyphen', async () => {
      const user = userEvent.setup();
      render(<NamespaceEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('my-namespace');
      await user.type(nameInput, 'invalid-name-');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(
          screen.getByText('Name must end with a lowercase letter or number'),
        ).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error for name with uppercase letters', async () => {
      const user = userEvent.setup();
      render(<NamespaceEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('my-namespace');
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

    it('should show error for name with special characters', async () => {
      const user = userEvent.setup();
      render(<NamespaceEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('my-namespace');
      await user.type(nameInput, 'invalid_name');

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

  describe('successful submission', () => {
    it('should call onSave with valid name', async () => {
      const user = userEvent.setup();
      render(<NamespaceEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('my-namespace');
      await user.type(nameInput, 'valid-namespace');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith('valid-namespace');
      });
    });

    it('should accept name with dots', async () => {
      const user = userEvent.setup();
      render(<NamespaceEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('my-namespace');
      await user.type(nameInput, 'my.namespace');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith('my.namespace');
      });
    });

    it('should accept name with numbers', async () => {
      const user = userEvent.setup();
      render(<NamespaceEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('my-namespace');
      await user.type(nameInput, 'namespace123');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith('namespace123');
      });
    });
  });

  describe('dialog behavior', () => {
    it('should reset form when dialog closes', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<NamespaceEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('my-namespace');
      await user.type(nameInput, 'some-value');

      rerender(<NamespaceEditor {...defaultProps} open={false} />);
      rerender(<NamespaceEditor {...defaultProps} open={true} />);

      const newNameInput = screen.getByPlaceholderText('my-namespace');
      expect(newNameInput).toHaveValue('');
    });

    it('should call onOpenChange when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<NamespaceEditor {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

