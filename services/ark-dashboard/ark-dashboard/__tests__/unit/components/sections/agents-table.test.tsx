import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentsTable } from '@/components/sections/agents-table';
import type { Agent } from '@/lib/services';

const mockPush = vi.fn();
const mockToggleFloatingChat = vi.fn();
const mockIsOpen = vi.fn(() => false);

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: mockPush }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/chat-context', () => ({
  useChatState: () => ({ isOpen: mockIsOpen }),
}));

vi.mock('@/lib/chat-events', () => ({
  toggleFloatingChat: (...args: unknown[]) => mockToggleFloatingChat(...args),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ readOnlyMode: false }),
}));

vi.mock('@/components/dialogs/confirmation-dialog', () => ({
  ConfirmationDialog: ({
    open,
    onConfirm,
    confirmText,
  }: {
    open: boolean;
    onConfirm: () => void;
    confirmText: string;
  }) =>
    open ? (
      <div data-testid="confirmation-dialog">
        <button onClick={onConfirm}>{confirmText}</button>
      </div>
    ) : null,
}));

const agents: Agent[] = [
  {
    id: 'a1',
    name: 'agent-one',
    description: 'First agent',
    available: 'True',
  } as Agent,
  {
    id: 'a2',
    name: 'agent-two',
    description: '',
    available: 'False',
  } as Agent,
];

describe('AgentsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOpen.mockReturnValue(false);
  });

  it('renders agent names and descriptions', () => {
    render(<AgentsTable agents={agents} onDelete={vi.fn()} />);
    expect(screen.getByText('agent-one')).toBeInTheDocument();
    expect(screen.getByText('First agent')).toBeInTheDocument();
    expect(screen.getByText('agent-two')).toBeInTheDocument();
    expect(screen.getByText('No description')).toBeInTheDocument();
  });

  it('renders status labels for True / False / undefined', () => {
    const withUnknown = [
      ...agents,
      { id: 'a3', name: 'agent-three', description: '' } as Agent,
    ];
    render(<AgentsTable agents={withUnknown} onDelete={vi.fn()} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders a link to the agent detail for each row', () => {
    render(<AgentsTable agents={agents} onDelete={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'agent-one' })).toHaveAttribute(
      'href',
      expect.stringContaining('/agents/agent-one'),
    );
    expect(screen.getByRole('link', { name: 'agent-two' })).toHaveAttribute(
      'href',
      expect.stringContaining('/agents/agent-two'),
    );
  });

  it('chat button triggers toggleFloatingChat and does not navigate', async () => {
    const user = userEvent.setup();
    render(<AgentsTable agents={agents} onDelete={vi.fn()} />);
    await user.click(screen.getAllByLabelText('Chat with agent')[0]);
    expect(mockToggleFloatingChat).toHaveBeenCalledWith('agent-one', 'agent');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens confirmation dialog and calls onDelete on confirm', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<AgentsTable agents={agents} onDelete={onDelete} />);
    await user.click(screen.getAllByLabelText('Delete agent')[0]);
    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    await user.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith('a1');
  });

  it('disables delete button when chat is open for that agent', () => {
    mockIsOpen.mockImplementation((name: string): boolean => name === 'agent-one');
    render(<AgentsTable agents={agents} onDelete={vi.fn()} />);
    const deleteButtons = screen.getAllByLabelText('Delete agent');
    expect(deleteButtons[0]).toBeDisabled();
    expect(deleteButtons[1]).not.toBeDisabled();
  });

  it('renders the table headers', () => {
    render(<AgentsTable agents={agents} onDelete={vi.fn()} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });
});
