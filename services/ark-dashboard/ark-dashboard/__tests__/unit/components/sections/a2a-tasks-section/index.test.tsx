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
    expect(screen.getByLabelText('Loading A2A tasks')).toBeInTheDocument();
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
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText("Couldn't load A2A tasks")).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
  });

  it('renders empty state correctly', () => {
    mockUseListA2ATasks.mockReturnValue({
      isPending: false,
      data: { items: [], count: 0 },
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(
      <MockRouter>
        <A2ATasksSection />
      </MockRouter>,
    );
    expect(screen.getByText('No A2A task yet')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /learn more/i }),
    ).toBeInTheDocument();
  });

  it('renders tasks in the designed column order', () => {
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
      data: { items: tasks, count: tasks.length },
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(
      <MockRouter>
        <A2ATasksSection />
      </MockRouter>,
    );

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map(h => h.textContent?.trim())).toEqual([
      'Created',
      'Task ID',
      'Name',
      'Agent',
      'Query',
      'Status',
    ]);

    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(3);

    // Newest first by default, so Task-1 (with a timestamp) sorts above Task-2.
    const [created1, id1, name1, agent1, query1, status1] = within(
      rows[1],
    ).getAllByRole('cell');
    expect(created1.textContent).toBeDefined();
    expect(id1.textContent).toEqual('task-1');
    expect(name1.textContent).toEqual('Task-1');
    expect(agent1.textContent).toEqual('Agent-1');
    expect(query1.textContent).toEqual('Query-1');
    expect(status1.textContent).toEqual('Completed');

    const [created2, id2, , , , status2] = within(rows[2]).getAllByRole('cell');
    expect(created2.textContent).toEqual('-');
    expect(id2.textContent).toEqual('task-2');
    expect(status2.textContent).toEqual('Pending');
  });

  it('shows the task count in the page title', () => {
    mockUseListA2ATasks.mockReturnValue({
      isPending: false,
      data: { items: [], count: 5 },
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(
      <MockRouter>
        <A2ATasksSection />
      </MockRouter>,
    );

    expect(screen.getByText('A2A tasks (5)')).toBeInTheDocument();
  });

  it('toggles the created sort order', async () => {
    const tasks = [
      {
        taskId: 'older',
        name: 'Older',
        phase: 'completed',
        agentRef: { name: 'Agent-1' },
        queryRef: { name: 'Query-1' },
        creationTimestamp: '2023-01-01T00:00:00Z',
      },
      {
        taskId: 'newer',
        name: 'Newer',
        phase: 'completed',
        agentRef: { name: 'Agent-2' },
        queryRef: { name: 'Query-2' },
        creationTimestamp: '2024-01-01T00:00:00Z',
      },
    ];

    mockUseListA2ATasks.mockReturnValue({
      isPending: false,
      data: { items: tasks, count: tasks.length },
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(
      <MockRouter>
        <A2ATasksSection />
      </MockRouter>,
    );

    const firstTaskId = () =>
      within(screen.getAllByRole('row')[1]).getAllByRole('cell')[1].textContent;

    expect(firstTaskId()).toEqual('newer');

    await userEvent.click(screen.getByRole('button', { name: /sort by/i }));

    expect(firstTaskId()).toEqual('older');
  });

  it('calls refetch when refresh button is clicked', async () => {
    const mockRefetch = vi.fn();
    mockUseListA2ATasks.mockReturnValue({
      isPending: false,
      data: { items: [], count: 0 },
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
      data: { items: tasks, count: tasks.length },
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(
      <MockRouter>
        <A2ATasksSection />
      </MockRouter>,
    );

    expect(screen.getAllByRole('link', { name: 'Task 1' })[0]).toHaveAttribute(
      'href',
      expect.stringContaining('/tasks/Task%201'),
    );
  });
});
