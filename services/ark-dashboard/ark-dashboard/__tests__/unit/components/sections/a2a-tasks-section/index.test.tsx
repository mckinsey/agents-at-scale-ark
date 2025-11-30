import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AppRouterContext,
  type AppRouterInstance,
} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

import { A2ATasksSection } from '@/components/sections/a2a-tasks-section';
import { useListA2ATasks } from '@/lib/services/a2a-tasks-hooks';

vi.mock('@/lib/services/a2a-tasks-hooks');

const mockPush = vi.fn();

const MockRouter = ({ children }: { children: React.ReactNode }) => {
  const mockRouter: AppRouterInstance = {
    back: vi.fn(),
    forward: vi.fn(),
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  };

  return (
    <AppRouterContext.Provider value={mockRouter}>
      {children}
    </AppRouterContext.Provider>
  );
};

describe('A2ATasksSection', () => {
  const mockUseListA2ATasks = useListA2ATasks as Mock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state correctly', () => {
    mockUseListA2ATasks.mockReturnValue({
      isPending: true,
      data: undefined,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(
      <MockRouter>
        <A2ATasksSection />
      </MockRouter>,
    );
    expect(screen.getByText('Loading tasks...')).toBeInTheDocument();
  });

  it('renders error state correctly', () => {
    const error = new Error('Failed to fetch');
    mockUseListA2ATasks.mockReturnValue({
      isPending: false,
      data: undefined,
      error: error,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(
      <MockRouter>
        <A2ATasksSection />
      </MockRouter>,
    );
    expect(screen.getByText('Error loading tasks')).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });

  it('renders empty state correctly', () => {
    mockUseListA2ATasks.mockReturnValue({
      isPending: false,
      data: { items: [] },
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(
      <MockRouter>
        <A2ATasksSection />
      </MockRouter>,
    );
    expect(screen.getByText('No A2A Tasks Found')).toBeInTheDocument();
  });

  it('renders tasks correctly', () => {
    const tasks = [
      {
        taskId: 'task-1',
        name: 'Task-1',
        phase: 'completed',
        agentRef: { name: 'Agent-1' },
        queryRef: { name: 'Query-1' },
        creationTimestamp: '2023-01-01T00:00:00Z',
      },
      {
        taskId: 'task-2',
        name: 'Task-2',
        phase: 'pending',
        agentRef: { name: 'Agent-1' },
        queryRef: { name: 'Query-2' },
        creationTimestamp: undefined,
      },
    ];

    mockUseListA2ATasks.mockReturnValue({
      isPending: false,
      data: { items: tasks },
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(
      <MockRouter>
        <A2ATasksSection />
      </MockRouter>,
    );

    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(3);

    const [id1, name1, _phase1, agentRef1, queryRef1, creationTimestamp1] =
      within(rows[1]).getAllByRole('cell');
    expect(id1.textContent).toEqual('task-1');
    expect(name1.textContent).toEqual('Task-1');
    expect(agentRef1.textContent).toEqual('Agent-1');
    expect(queryRef1.textContent).toEqual('Query-1');
    expect(creationTimestamp1.textContent).toBeDefined();

    const [id2, name2, _phase2, agentRef2, queryRef2, creationTimestamp2] =
      within(rows[2]).getAllByRole('cell');
    expect(id2.textContent).toEqual('task-2');
    expect(name2.textContent).toEqual('Task-2');
    expect(agentRef2.textContent).toEqual('Agent-1');
    expect(queryRef2.textContent).toEqual('Query-2');
    expect(creationTimestamp2.textContent).toEqual('-');
  });

  it('calls refetch when refresh button is clicked', async () => {
    const mockRefetch = vi.fn();
    mockUseListA2ATasks.mockReturnValue({
      isPending: false,
      data: { items: [] },
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    });

    render(
      <MockRouter>
        <A2ATasksSection />
      </MockRouter>,
    );

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await userEvent.click(refreshButton);

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('navigates to task details when a task is clicked', async () => {
    const tasks = [
      {
        taskId: 'task-1',
        name: 'Task 1',
        phase: 'completed',
        agentRef: { name: 'Agent 1' },
        queryRef: { name: 'Query 1' },
        creationTimestamp: '2023-01-01T00:00:00Z',
      },
    ];

    mockUseListA2ATasks.mockReturnValue({
      isPending: false,
      data: { items: tasks },
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(
      <MockRouter>
        <A2ATasksSection />
      </MockRouter>,
    );

    const taskRow = screen.getByText('Task 1');
    await userEvent.click(taskRow);

    expect(mockPush).toHaveBeenCalledWith('/tasks/Task 1');
  });
});
