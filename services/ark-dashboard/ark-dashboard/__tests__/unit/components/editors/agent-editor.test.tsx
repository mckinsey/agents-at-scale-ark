import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'jotai';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentEditor } from '@/components/editors/agent-editor';
import type { Model, Team } from '@/lib/services';

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
  toolsService: { getAll: vi.fn().mockResolvedValue([]) },
}));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <Provider>
      <DndProvider backend={HTML5Backend}>{ui}</DndProvider>
    </Provider>,
  );
};

describe('AgentEditor', () => {
  const mockModels: Model[] = [
    {
      id: 'model-1',
      name: 'gpt-4',
      namespace: 'default',
      type: 'openai',
      model: 'gpt-4',
      config: {},
    },
  ];
  const mockTeams: Team[] = [{ name: 'team-1' } as Team];

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSave: vi.fn(),
    models: mockModels,
    teams: mockTeams,
    agent: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('should show error when name is empty on submit', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AgentEditor {...defaultProps} />);

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });

    it('should show error for invalid kubernetes name', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AgentEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText(
        'e.g., customer-support-agent',
      );
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

    it('should show error for name starting with hyphen', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AgentEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText(
        'e.g., customer-support-agent',
      );
      await user.type(nameInput, '-invalid-agent');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(
          screen.getByText('Name must start with a lowercase letter or number'),
        ).toBeInTheDocument();
      });
      expect(defaultProps.onSave).not.toHaveBeenCalled();
    });
  });

  describe('successful submission', () => {
    it('should call onSave with valid name', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AgentEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText(
        'e.g., customer-support-agent',
      );
      await user.type(nameInput, 'my-agent');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'my-agent',
          }),
        );
      });
    });

    it('should include description when provided', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AgentEditor {...defaultProps} />);

      const nameInput = screen.getByPlaceholderText(
        'e.g., customer-support-agent',
      );
      await user.type(nameInput, 'my-agent');

      const descInput = screen.getByPlaceholderText(
        'e.g., Handles customer inquiries and support tickets',
      );
      await user.type(descInput, 'My agent description');

      const createButton = screen.getByRole('button', { name: /create/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(defaultProps.onSave).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'my-agent',
            description: 'My agent description',
          }),
        );
      });
    });
  });

  describe('edit mode', () => {
    const existingAgent = {
      id: 'agent-1',
      name: 'existing-agent',
      namespace: 'default',
      description: 'Existing agent',
      model: 'gpt-4',
      isA2A: false,
    } as const;

    it('should disable name field when editing', async () => {
      renderWithProviders(
        <AgentEditor {...defaultProps} agent={existingAgent} />,
      );

      const nameInput = screen.getByPlaceholderText(
        'e.g., customer-support-agent',
      );
      expect(nameInput).toBeDisabled();
    });

    it('should show Update button when editing', async () => {
      renderWithProviders(
        <AgentEditor {...defaultProps} agent={existingAgent} />,
      );

      expect(
        screen.getByRole('button', { name: /update/i }),
      ).toBeInTheDocument();
    });
  });

  describe('dialog behavior', () => {
    it('should call onOpenChange when cancel is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AgentEditor {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });

    it('should display model selector', async () => {
      renderWithProviders(<AgentEditor {...defaultProps} />);

      expect(screen.getByText('Model')).toBeInTheDocument();
    });
  });
});

