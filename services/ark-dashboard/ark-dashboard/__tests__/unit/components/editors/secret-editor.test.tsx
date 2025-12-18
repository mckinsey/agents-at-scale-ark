import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SecretEditor } from '@/components/editors/secret-editor';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('SecretEditor', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSave: vi.fn(),
    secret: null,
    existingSecrets: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('should show error when name is empty on submit', async () => {
      const user = userEvent.setup();
      render(<SecretEditor {...defaultProps} />);

      const passwordInput = screen.getByPlaceholderText(
        'Enter the secret password',
      );
      await user.type(passwordInput, 'secret123');

      const addButton = screen.getByRole('button', { name: /add secret/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error when password is empty on submit', async () => {
      const user = userEvent.setup();
      render(<SecretEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g. api-key-production');
      await user.type(nameInput, 'valid-secret');

      const addButton = screen.getByRole('button', { name: /add secret/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText('Password is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error for invalid kubernetes name', async () => {
      const user = userEvent.setup();
      render(<SecretEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g. api-key-production');
      await user.type(nameInput, 'Invalid_Name');

      const passwordInput = screen.getByPlaceholderText(
        'Enter the secret password',
      );
      await user.type(passwordInput, 'secret123');

      const addButton = screen.getByRole('button', { name: /add secret/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByText(
            /Name must consist of lowercase alphanumeric characters/,
          ),
        ).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error for duplicate name', async () => {
      const user = userEvent.setup();
      const existingSecrets = [{ name: 'existing-secret', id: 'secret-1' }];
      render(
        <SecretEditor {...defaultProps} existingSecrets={existingSecrets} />,
      );

      const nameInput = screen.getByPlaceholderText('e.g. api-key-production');
      await user.type(nameInput, 'existing-secret');

      const passwordInput = screen.getByPlaceholderText(
        'Enter the secret password',
      );
      await user.type(passwordInput, 'secret123');

      const addButton = screen.getByRole('button', { name: /add secret/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(
          screen.getByText('A secret with this name already exists'),
        ).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });
  });

  describe('successful submission', () => {
    it('should call onSave with valid data', async () => {
      const user = userEvent.setup();
      render(<SecretEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g. api-key-production');
      await user.type(nameInput, 'my-secret');

      const passwordInput = screen.getByPlaceholderText(
        'Enter the secret password',
      );
      await user.type(passwordInput, 'super-secret-password');

      const addButton = screen.getByRole('button', { name: /add secret/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith(
          'my-secret',
          'super-secret-password',
        );
      });
    });

    it('should accept name with hyphens and dots', async () => {
      const user = userEvent.setup();
      render(<SecretEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g. api-key-production');
      await user.type(nameInput, 'my-secret.key');

      const passwordInput = screen.getByPlaceholderText(
        'Enter the secret password',
      );
      await user.type(passwordInput, 'password123');

      const addButton = screen.getByRole('button', { name: /add secret/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith(
          'my-secret.key',
          'password123',
        );
      });
    });
  });

  describe('edit mode', () => {
    const existingSecret = { name: 'existing-secret', id: 'secret-1' };

    it('should disable name field when editing', async () => {
      render(<SecretEditor {...defaultProps} secret={existingSecret} />);

      const nameInput = screen.getByPlaceholderText('e.g. api-key-production');
      expect(nameInput).toBeDisabled();
    });

    it('should show Update Secret button when editing', async () => {
      render(<SecretEditor {...defaultProps} secret={existingSecret} />);

      expect(
        screen.getByRole('button', { name: /update secret/i }),
      ).toBeInTheDocument();
    });

    it('should allow duplicate name check to pass when editing', async () => {
      const user = userEvent.setup();
      const existingSecrets = [{ name: 'existing-secret', id: 'secret-1' }];
      render(
        <SecretEditor
          {...defaultProps}
          secret={existingSecret}
          existingSecrets={existingSecrets}
        />,
      );

      const passwordInput = screen.getByPlaceholderText(
        'Enter the secret password',
      );
      await user.type(passwordInput, 'new-password');

      const updateButton = screen.getByRole('button', {
        name: /update secret/i,
      });
      await user.click(updateButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith(
          'existing-secret',
          'new-password',
        );
      });
    });
  });

  describe('dialog behavior', () => {
    it('should reset form when dialog reopens', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<SecretEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g. api-key-production');
      await user.type(nameInput, 'some-value');

      rerender(<SecretEditor {...defaultProps} open={false} />);
      rerender(<SecretEditor {...defaultProps} open={true} />);

      const newNameInput = screen.getByPlaceholderText(
        'e.g. api-key-production',
      );
      expect(newNameInput).toHaveValue('');
    });

    it('should call onOpenChange when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<SecretEditor {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

