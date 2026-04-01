import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { A2AEditor } from '@/components/editors/a2a-editor';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('A2AEditor', () => {
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
      render(<A2AEditor {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error when URL is empty on submit', async () => {
      const user = userEvent.setup();
      render(<A2AEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g., deep-research');
      await user.type(nameInput, 'valid-name');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('URL is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error for invalid URL format', async () => {
      const user = userEvent.setup();
      render(<A2AEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g., deep-research');
      await user.type(nameInput, 'valid-name');

      const urlInput = screen.getByPlaceholderText(
        /https:\/\/agentspace-a2a/i,
      );
      await user.type(urlInput, 'not-a-valid-url');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('URL must be a valid URL')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should accept valid numeric polling interval', async () => {
      const user = userEvent.setup();
      render(<A2AEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g., deep-research');
      await user.type(nameInput, 'valid-name');

      const urlInput = screen.getByPlaceholderText(
        /https:\/\/agentspace-a2a/i,
      );
      await user.type(urlInput, 'https://example.com');

      const pollingInput = screen.getByPlaceholderText('e.g., 60');
      await user.type(pollingInput, '120');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            spec: expect.objectContaining({
              pollingInterval: 120,
            }),
          }),
        );
      });
    });
  });

  describe('successful submission', () => {
    it('should call onSave with valid data', async () => {
      const user = userEvent.setup();
      render(<A2AEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g., deep-research');
      await user.type(nameInput, 'my-a2a-server');

      const urlInput = screen.getByPlaceholderText(
        /https:\/\/agentspace-a2a/i,
      );
      await user.type(urlInput, 'https://example.com/api');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith({
          name: 'my-a2a-server',
          namespace: 'default',
          spec: {
            description: undefined,
            address: { value: 'https://example.com/api' },
            pollingInterval: undefined,
          },
        });
      });
    });

    it('should call onSave with description and polling interval', async () => {
      const user = userEvent.setup();
      render(<A2AEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g., deep-research');
      await user.type(nameInput, 'my-a2a-server');

      const descInput = screen.getByPlaceholderText('What this server does');
      await user.type(descInput, 'My A2A server description');

      const urlInput = screen.getByPlaceholderText(
        /https:\/\/agentspace-a2a/i,
      );
      await user.type(urlInput, 'https://example.com/api');

      const pollingInput = screen.getByPlaceholderText('e.g., 60');
      await user.type(pollingInput, '30');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith({
          name: 'my-a2a-server',
          namespace: 'default',
          spec: {
            description: 'My A2A server description',
            address: { value: 'https://example.com/api' },
            pollingInterval: 30,
          },
        });
      });
    });
  });

  describe('dialog behavior', () => {
    it('should reset form when dialog reopens', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<A2AEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('e.g., deep-research');
      await user.type(nameInput, 'some-value');

      rerender(<A2AEditor {...defaultProps} open={false} />);
      rerender(<A2AEditor {...defaultProps} open={true} />);

      const newNameInput = screen.getByPlaceholderText('e.g., deep-research');
      expect(newNameInput).toHaveValue('');
    });

    it('should call onOpenChange when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<A2AEditor {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
