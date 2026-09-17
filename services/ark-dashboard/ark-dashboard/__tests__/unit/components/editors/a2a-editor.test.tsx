import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { A2AEditor, buildHeader } from '@/components/editors/a2a-editor';

vi.mock('@/lib/services/secrets-hooks', () => ({
  useGetAllSecrets: () => ({ data: [] }),
}));

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

      const urlInput = screen.getByPlaceholderText(/https:\/\/agentspace-a2a/i);
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

      const urlInput = screen.getByPlaceholderText(/https:\/\/agentspace-a2a/i);
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

      const urlInput = screen.getByPlaceholderText(/https:\/\/agentspace-a2a/i);
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

      const descInput = screen.getByPlaceholderText('what this server does');
      await user.type(descInput, 'My A2A server description');

      const urlInput = screen.getByPlaceholderText(/https:\/\/agentspace-a2a/i);
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

    it('should not close while a save is in flight', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      let resolveSave: () => void = () => {};
      const onSave = vi.fn(
        () =>
          new Promise<void>(resolve => {
            resolveSave = resolve;
          }),
      );
      render(
        <A2AEditor
          {...defaultProps}
          onOpenChange={onOpenChange}
          onSave={onSave}
        />,
      );

      const nameInput = screen.getByPlaceholderText('e.g., deep-research');
      await user.type(nameInput, 'my-a2a-server');

      const urlInput = screen.getByPlaceholderText(/https:\/\/agentspace-a2a/i);
      await user.type(urlInput, 'https://example.com/api');

      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });

      await user.keyboard('{Escape}');

      expect(onOpenChange).not.toHaveBeenCalled();
      expect(nameInput).toHaveValue('my-a2a-server');

      resolveSave();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /create/i }),
        ).not.toBeDisabled();
      });

      await user.keyboard('{Escape}');

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('should call onOpenChange when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<A2AEditor {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('headers', () => {
    const fillRequiredFields = async (
      user: ReturnType<typeof userEvent.setup>,
    ) => {
      await user.type(
        screen.getByPlaceholderText('e.g., deep-research'),
        'my-a2a-server',
      );
      await user.type(
        screen.getByPlaceholderText(/https:\/\/agentspace-a2a/i),
        'https://example.com/api',
      );
    };

    it('should submit an inline header and drop blank rows', async () => {
      const user = userEvent.setup();
      render(<A2AEditor {...defaultProps} />);

      await fillRequiredFields(user);
      await user.type(
        screen.getByPlaceholderText('e.g., Authorization'),
        'Authorization',
      );
      await user.type(
        screen.getByPlaceholderText('e.g., Bearer token'),
        'Bearer abc',
      );
      await user.click(screen.getByRole('button', { name: 'Add header' }));
      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalled();
      });
      const config = vi.mocked(defaultProps.onSave).mock.calls[0][0];
      expect(config.spec.headers).toEqual([
        { name: 'Authorization', value: { value: 'Bearer abc' } },
      ]);
    });

    it('should block submit until a half-filled row is completed', async () => {
      const user = userEvent.setup();
      render(<A2AEditor {...defaultProps} />);

      await fillRequiredFields(user);
      await user.type(
        screen.getByPlaceholderText('e.g., Authorization'),
        'X-Test',
      );
      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(
          screen.getByText('Header value is required'),
        ).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();

      await user.type(
        screen.getByPlaceholderText('e.g., Bearer token'),
        'filled',
      );

      await waitFor(() => {
        expect(
          screen.queryByText('Header value is required'),
        ).not.toBeInTheDocument();
      });
    });

    it('should omit headers when the row is deleted', async () => {
      const user = userEvent.setup();
      render(<A2AEditor {...defaultProps} />);

      await fillRequiredFields(user);
      await user.type(
        screen.getByPlaceholderText('e.g., Authorization'),
        'Authorization',
      );
      await user.click(screen.getByRole('button', { name: 'Delete header' }));
      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalled();
      });
      const config = vi.mocked(defaultProps.onSave).mock.calls[0][0];
      expect(config.spec.headers).toBeUndefined();
    });

    it('should clear the name error once a header name is typed', async () => {
      const user = userEvent.setup();
      render(<A2AEditor {...defaultProps} />);

      await fillRequiredFields(user);
      await user.type(
        screen.getByPlaceholderText('e.g., Bearer token'),
        'only-a-value',
      );
      await user.click(screen.getByRole('button', { name: /create/i }));

      await waitFor(() => {
        expect(screen.getByText('Header name is required')).toBeInTheDocument();
      });

      await user.type(
        screen.getByPlaceholderText('e.g., Authorization'),
        'X-Name',
      );

      await waitFor(() => {
        expect(
          screen.queryByText('Header name is required'),
        ).not.toBeInTheDocument();
      });
    });

    it('should map direct and secret rows onto the spec shape', () => {
      expect(
        buildHeader({ key: 'r', name: 'A', type: 'direct', value: 'inline' }),
      ).toEqual({ name: 'A', value: { value: 'inline' } });

      expect(
        buildHeader({
          key: 'r',
          name: 'A',
          type: 'secret',
          value: 'my-secret',
        }),
      ).toEqual({
        name: 'A',
        value: {
          valueFrom: { secretKeyRef: { name: 'my-secret', key: 'token' } },
        },
      });
    });
  });
});
