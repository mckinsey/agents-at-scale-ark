import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { EvaluatorEditor } from '@/components/editors/evaluator-editor';

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

vi.mock('@/lib/services', () => ({
  modelsService: {
    getAll: vi.fn().mockResolvedValue([{ name: 'gpt-4' }]),
  },
  evaluatorsService: {
    getDetailsByName: vi.fn().mockResolvedValue(null),
  },
}));

describe('EvaluatorEditor', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSave: vi.fn(),
    evaluator: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('should show error when name is empty on submit', async () => {
      const user = userEvent.setup();
      render(<EvaluatorEditor {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error for invalid name format', async () => {
      const user = userEvent.setup();
      render(<EvaluatorEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('evaluator-name');
      await user.type(nameInput, 'Invalid Name!');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Name must be a valid Kubernetes name/),
        ).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });
  });

  describe('form display', () => {
    it('should display name field', async () => {
      render(<EvaluatorEditor {...defaultProps} />);

      expect(screen.getByText(/^Name/)).toBeInTheDocument();
    });

    it('should have create button', async () => {
      render(<EvaluatorEditor {...defaultProps} />);

      expect(
        screen.getByRole('button', { name: /create/i }),
      ).toBeInTheDocument();
    });

    it('should have cancel button', async () => {
      render(<EvaluatorEditor {...defaultProps} />);

      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).toBeInTheDocument();
    });
  });

  describe('edit mode', () => {
    const existingEvaluator = {
      name: 'existing-evaluator',
      namespace: 'default',
    };

    it('should disable name field when editing', async () => {
      render(
        <EvaluatorEditor {...defaultProps} evaluator={existingEvaluator} />,
      );

      await waitFor(() => {
        const nameInput = screen.getByPlaceholderText('evaluator-name');
        expect(nameInput).toBeDisabled();
      });
    });

    it('should show Update button when editing', async () => {
      render(
        <EvaluatorEditor {...defaultProps} evaluator={existingEvaluator} />,
      );

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /update/i }),
        ).toBeInTheDocument();
      });
    });
  });

  describe('dialog behavior', () => {
    it('should call onOpenChange when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(<EvaluatorEditor {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

