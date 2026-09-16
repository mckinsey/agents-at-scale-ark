/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from '@testing-library/react';
import { useParams } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

import A2ATaskPage from '@/app/(dashboard)/tasks/[id]/page';
import type { A2ATaskDetailResponse } from '@/lib/api/a2a-tasks-types';
import { useA2ATask } from '@/lib/services/a2a-tasks-hooks';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
  usePathname: vi.fn(() => '/tasks/task-1'),
  useRouter: vi.fn(() => ({ back: vi.fn(), push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// Mock services
vi.mock('@/lib/services/a2a-tasks-hooks', () => ({
  useA2ATask: vi.fn(),
}));

/**
 * DetailRow renders its label as a tooltip trigger (a button) followed by the
 * value, both inside the row element — so the row's text is "<label><value>".
 * Querying by button role also disambiguates labels like "Completed", which
 * appear both as a Timing label and as a status value.
 */
function rowText(label: string) {
  return screen.getByRole('button', { name: label }).parentElement?.textContent;
}

function mockTaskResult(data: Partial<A2ATaskDetailResponse> | undefined) {
  vi.mocked(useParams).mockReturnValue({ id: 'task-1' });
  vi.mocked(useA2ATask).mockReturnValue({
    isLoading: false,
    data,
    error: null,
  } as any);
}

describe('A2ATaskPage', () => {
  it('should show loading state', () => {
    vi.mocked(useParams).mockReturnValue({ id: 'task-1' });
    vi.mocked(useA2ATask).mockReturnValue({
      isLoading: true,
      data: undefined,
      error: null,
    } as any);

    render(<A2ATaskPage />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should show error state', () => {
    vi.mocked(useParams).mockReturnValue({ id: 'task-1' });
    vi.mocked(useA2ATask).mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new Error('Failed to load'),
    } as any);

    render(<A2ATaskPage />);
    expect(screen.getByText("Couldn't load this A2A task")).toBeInTheDocument();
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to a2a tasks/i }),
    ).toBeInTheDocument();
  });

  it('should show not-found state when the task is missing', () => {
    mockTaskResult(undefined);

    render(<A2ATaskPage />);
    expect(screen.getByText('A2A task not found')).toBeInTheDocument();
  });

  it('should render task details', () => {
    mockTaskResult({
      name: 'Test Task',
      taskId: 'task-1',
      agentRef: { name: 'Agent Smith' },
      queryRef: { name: 'Query 1' },
      a2aServerRef: { name: 'Server 1' },
      metadata: { creationTimestamp: '2023-01-01T10:00:00Z' },
      status: {
        phase: 'completed',
        protocolState: 'finished',
        completionTime: '2023-01-01T10:05:00Z',
      },
      input: 'Do something',
    });

    render(<A2ATaskPage />);

    // Breadcrumb back to the list, then the task id as the page title.
    expect(
      screen.getByRole('link', { name: /a2a tasks/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'task-1' })).toBeInTheDocument();

    expect(rowText('Status')).toBe('StatusCompleted');
    expect(rowText('Protocol state')).toBe('Protocol statefinished');
    expect(rowText('Agent')).toBe('AgentAgent Smith');
    expect(rowText('Query')).toBe('QueryQuery 1');
    expect(rowText('Server')).toBe('ServerServer 1');
    expect(screen.getByText('Do something')).toBeInTheDocument();
    expect(screen.getByText('Raw Data')).toBeInTheDocument();
  });

  it('should display creation timestamp when present', () => {
    mockTaskResult({
      name: 'Test Task',
      taskId: 'task-1',
      metadata: { creationTimestamp: '2023-01-01T10:00:00Z' },
      status: { phase: 'running' },
    });

    render(<A2ATaskPage />);

    const expectedDate = new Date('2023-01-01T10:00:00Z').toLocaleString();
    expect(rowText('Created')).toBe(`Created${expectedDate}`);
  });

  it('should display dash when creation timestamp is missing', () => {
    mockTaskResult({
      name: 'Test Task',
      taskId: 'task-1',
      metadata: { creationTimestamp: undefined },
      status: { phase: 'running' },
    });

    render(<A2ATaskPage />);
    expect(rowText('Created')).toBe('Created—');
  });

  it('should display completion timestamp when present', () => {
    mockTaskResult({
      name: 'Test Task',
      taskId: 'task-1',
      metadata: { creationTimestamp: '2023-01-01T10:00:00Z' },
      status: { phase: 'completed', completionTime: '2023-01-01T10:05:00Z' },
    });

    render(<A2ATaskPage />);

    const expectedDate = new Date('2023-01-01T10:05:00Z').toLocaleString();
    expect(rowText('Completed')).toBe(`Completed${expectedDate}`);
  });

  it('should display dash when completion timestamp is missing', () => {
    mockTaskResult({
      name: 'Test Task',
      taskId: 'task-1',
      metadata: { creationTimestamp: '2023-01-01T10:00:00Z' },
      status: { phase: 'running' },
    });

    render(<A2ATaskPage />);
    expect(rowText('Completed')).toBe('Completed—');
  });

  it('should calculate and display duration when both timestamps are present', () => {
    mockTaskResult({
      name: 'Test Task',
      taskId: 'task-1',
      metadata: { creationTimestamp: '2023-01-01T10:00:00Z' },
      status: { phase: 'completed', completionTime: '2023-01-01T10:05:00Z' },
    });

    render(<A2ATaskPage />);

    // simplifyDuration only strips trailing zero units, so 5 minutes is "300s".
    expect(rowText('Duration')).toBe('Duration300s');
  });

  it('should display dash for duration when creation timestamp is missing', () => {
    mockTaskResult({
      name: 'Test Task',
      taskId: 'task-1',
      metadata: { creationTimestamp: undefined },
      status: { phase: 'completed', completionTime: '2023-01-01T10:05:00Z' },
    });

    render(<A2ATaskPage />);
    expect(rowText('Duration')).toBe('Duration—');
  });

  it('should display dash for duration when completion timestamp is missing', () => {
    mockTaskResult({
      name: 'Test Task',
      taskId: 'task-1',
      metadata: { creationTimestamp: '2023-01-01T10:00:00Z' },
      status: { phase: 'running' },
    });

    render(<A2ATaskPage />);
    expect(rowText('Duration')).toBe('Duration—');
  });

  it('should render parameters only when present', () => {
    mockTaskResult({
      name: 'Test Task',
      taskId: 'task-1',
      metadata: { creationTimestamp: '2023-01-01T10:00:00Z' },
      status: { phase: 'running' },
    });

    const { unmount } = render(<A2ATaskPage />);
    expect(screen.queryByText('Parameters')).not.toBeInTheDocument();
    unmount();

    mockTaskResult({
      name: 'Test Task',
      taskId: 'task-1',
      metadata: { creationTimestamp: '2023-01-01T10:00:00Z' },
      status: { phase: 'running' },
      parameters: { region: 'emea' },
    });

    render(<A2ATaskPage />);
    expect(screen.getByText('Parameters')).toBeInTheDocument();
    expect(screen.getByText('region')).toBeInTheDocument();
    expect(screen.getByText('emea')).toBeInTheDocument();
  });
});
