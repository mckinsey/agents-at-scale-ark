import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EvaluationEditor } from '@/components/editors/evaluation-editor';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/services', () => ({
  agentsService: { getAll: vi.fn().mockResolvedValue([]) },
  teamsService: { getAll: vi.fn().mockResolvedValue([]) },
  modelsService: { getAll: vi.fn().mockResolvedValue([]) },
  evaluatorsService: {
    getAll: vi.fn().mockResolvedValue([{ name: 'test-evaluator' }]),
  },
  evaluationsService: { getDetailsByName: vi.fn().mockResolvedValue(null) },
  queriesService: { list: vi.fn().mockResolvedValue({ items: [], count: 0 }) },
}));

describe('EvaluationEditor', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSave: vi.fn(),
    evaluation: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('should show error when name is empty on submit', async () => {
      const user = userEvent.setup();
      render(<EvaluationEditor {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error for invalid name format', async () => {
      const user = userEvent.setup();
      render(<EvaluationEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('evaluation-name');
      await user.type(nameInput, 'Invalid Name!');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(
          screen.getByText(
            /Name must be a valid Kubernetes name/,
          ),
        ).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error when evaluator is not selected', async () => {
      const user = userEvent.setup();
      render(<EvaluationEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText('evaluation-name');
      await user.type(nameInput, 'valid-name');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Evaluator is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });
  });

  describe('form display', () => {
    it('should display name and evaluator fields', async () => {
      render(<EvaluationEditor {...defaultProps} />);

      expect(screen.getByText(/^Name/)).toBeInTheDocument();
      expect(screen.getByText(/Evaluator/)).toBeInTheDocument();
    });

    it('should have create button', async () => {
      render(<EvaluationEditor {...defaultProps} />);

      expect(
        screen.getByRole('button', { name: /create/i }),
      ).toBeInTheDocument();
    });

    it('should have cancel button', async () => {
      render(<EvaluationEditor {...defaultProps} />);

      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).toBeInTheDocument();
    });
  });

  describe('edit mode', () => {
    const existingEvaluation = {
      name: 'existing-eval',
      namespace: 'default',
      type: 'direct',
    };

    it('should disable name field when editing', async () => {
      render(
        <EvaluationEditor {...defaultProps} evaluation={existingEvaluation} />,
      );

      await waitFor(() => {
        const nameInput = screen.getByPlaceholderText('evaluation-name');
        expect(nameInput).toBeDisabled();
      });
    });

    it('should show Update button when editing', async () => {
      render(
        <EvaluationEditor {...defaultProps} evaluation={existingEvaluation} />,
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
      render(<EvaluationEditor {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

