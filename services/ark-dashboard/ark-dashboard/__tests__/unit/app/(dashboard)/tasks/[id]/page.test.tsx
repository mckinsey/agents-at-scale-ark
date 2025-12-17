/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from '@testing-library/react';
import { useParams } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

import A2ATaskPage from '@/app/(dashboard)/tasks/[id]/page';
import type { A2ATaskDetailResponse } from '@/lib/api/a2a-tasks-types';
import { useA2ATask } from '@/lib/services/a2a-tasks-hooks';

// Mock next/navigation
const mockBack = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
  useRouter: vi.fn(() => ({
    back: mockBack,
  })),
}));

// Mock services
vi.mock('@/lib/services/a2a-tasks-hooks', () => ({
  useA2ATask: vi.fn(),
}));

// Mock components that might cause issues in unit tests
vi.mock('@/components/common/page-header', () => ({
  PageHeader: ({ currentPage }: { currentPage: string }) => (
    <div data-testid="page-header">{currentPage}</div>
  ),
}));

describe('A2ATaskPage', () => {
  it('should show loading state', () => {
    vi.mocked(useParams).mockReturnValue({ id: 'task-1' });
    vi.mocked(useA2ATask).mockReturnValue({
      isLoading: true,
      data: undefined,
      error: null,
    } as any);

    render(<A2ATaskPage />);
    expect(screen.getByText('Loading task...')).toBeInTheDocument();
  });

  it('should show error state', () => {
    vi.mocked(useParams).mockReturnValue({ id: 'task-1' });
    vi.mocked(useA2ATask).mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new Error('Failed to load'),
    } as any);

    render(<A2ATaskPage />);
    expect(screen.getByText('Error loading task')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('should render task details', async () => {
    vi.mocked(useParams).mockReturnValue({ id: 'task-1' });
    const mockTask: Partial<A2ATaskDetailResponse> = {
      name: 'Test Task',
      taskId: 'task-1',
      agentRef: { name: 'Agent Smith' },
      queryRef: { name: 'Query 1' },
      a2aServerRef: { name: 'Server 1' },
      metadata: {
        creationTimestamp: '2023-01-01T10:00:00Z',
      },
      status: {
        phase: 'completed',
        protocolState: 'finished',
        completionTime: '2023-01-01T10:05:00Z',
      },
      input: 'Do something',
      parameters: { param1: 'value1' },
    };

    vi.mocked(useA2ATask).mockReturnValue({
      isLoading: false,
      data: mockTask,
      error: null,
    } as any);

    render(<A2ATaskPage />);

    expect(screen.getByText('Test Task')).toBeInTheDocument();
    expect(screen.getByText('task-1')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('Agent Smith')).toBeInTheDocument();
    expect(screen.getByText('Do something')).toBeInTheDocument();
  });

  it('should display creation timestamp when present', () => {
    vi.mocked(useParams).mockReturnValue({ id: 'task-1' });
    const mockTask: Partial<A2ATaskDetailResponse> = {
      name: 'Test Task',
      taskId: 'task-1',
      metadata: {
        creationTimestamp: '2023-01-01T10:00:00Z',
      },
      status: {
        phase: 'running',
      },
    };

    vi.mocked(useA2ATask).mockReturnValue({
      isLoading: false,
      data: mockTask,
      error: null,
    } as any);

    render(<A2ATaskPage />);

    const expectedDate = new Date('2023-01-01T10:00:00Z').toLocaleString();
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
  });

  it('should display dash when creation timestamp is missing', () => {
    vi.mocked(useParams).mockReturnValue({ id: 'task-1' });
    const mockTask: Partial<A2ATaskDetailResponse> = {
      name: 'Test Task',
      taskId: 'task-1',
      metadata: {
        creationTimestamp: undefined,
      },
      status: {
        phase: 'running',
      },
    };

    vi.mocked(useA2ATask).mockReturnValue({
      isLoading: false,
      data: mockTask,
      error: null,
    } as any);

    render(<A2ATaskPage />);

    // Find the "Created" label and check the next element shows "-"
    const createdLabel = screen.getByText('Created');
    const timingSection = createdLabel.closest('.space-y-2');
    expect(timingSection).toHaveTextContent('Created-');
  });

  it('should display completion timestamp when present', () => {
    vi.mocked(useParams).mockReturnValue({ id: 'task-1' });
    const mockTask: Partial<A2ATaskDetailResponse> = {
      name: 'Test Task',
      taskId: 'task-1',
      metadata: {
        creationTimestamp: '2023-01-01T10:00:00Z',
      },
      status: {
        phase: 'completed',
        completionTime: '2023-01-01T10:05:00Z',
      },
    };

    vi.mocked(useA2ATask).mockReturnValue({
      isLoading: false,
      data: mockTask,
      error: null,
    } as any);

    render(<A2ATaskPage />);

    const expectedDate = new Date('2023-01-01T10:05:00Z').toLocaleString();
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
  });

  it('should display dash when completion timestamp is missing', () => {
    vi.mocked(useParams).mockReturnValue({ id: 'task-1' });
    const mockTask: Partial<A2ATaskDetailResponse> = {
      name: 'Test Task',
      taskId: 'task-1',
      metadata: {
        creationTimestamp: '2023-01-01T10:00:00Z',
      },
      status: {
        phase: 'running',
      },
    };

    vi.mocked(useA2ATask).mockReturnValue({
      isLoading: false,
      data: mockTask,
      error: null,
    } as any);

    render(<A2ATaskPage />);

    // Find the "Completed" label and check the next element shows "-"
    const completedLabel = screen.getByText('Completed');
    const timingSection = completedLabel.closest('.space-y-2');
    expect(timingSection).toHaveTextContent('Completed-');
  });

  it('should calculate and display duration when both timestamps are present', () => {
    vi.mocked(useParams).mockReturnValue({ id: 'task-1' });
    const mockTask: Partial<A2ATaskDetailResponse> = {
      name: 'Test Task',
      taskId: 'task-1',
      metadata: {
        creationTimestamp: '2023-01-01T10:00:00Z',
      },
      status: {
        phase: 'completed',
        completionTime: '2023-01-01T10:05:00Z', // 5 minutes later
      },
    };

    vi.mocked(useA2ATask).mockReturnValue({
      isLoading: false,
      data: mockTask,
      error: null,
    } as any);

    render(<A2ATaskPage />);

    // The duration should be 300 seconds
    // simplifyDuration doesn't convert units, it only removes trailing zeros
    const durationLabel = screen.getByText('Duration');
    const timingSection = durationLabel.closest('.space-y-2');
    expect(timingSection).toHaveTextContent('Duration300s');
  });

  it('should display dash for duration when creation timestamp is missing', () => {
    vi.mocked(useParams).mockReturnValue({ id: 'task-1' });
    const mockTask: Partial<A2ATaskDetailResponse> = {
      name: 'Test Task',
      taskId: 'task-1',
      metadata: {
        creationTimestamp: undefined,
      },
      status: {
        phase: 'completed',
        completionTime: '2023-01-01T10:05:00Z',
      },
    };

    vi.mocked(useA2ATask).mockReturnValue({
      isLoading: false,
      data: mockTask,
      error: null,
    } as any);

    render(<A2ATaskPage />);

    const durationLabel = screen.getByText('Duration');
    const timingSection = durationLabel.closest('.space-y-2');
    expect(timingSection).toHaveTextContent('Duration-');
  });

  it('should display dash for duration when completion timestamp is missing', () => {
    vi.mocked(useParams).mockReturnValue({ id: 'task-1' });
    const mockTask: Partial<A2ATaskDetailResponse> = {
      name: 'Test Task',
      taskId: 'task-1',
      metadata: {
        creationTimestamp: '2023-01-01T10:00:00Z',
      },
      status: {
        phase: 'running',
      },
    };

    vi.mocked(useA2ATask).mockReturnValue({
      isLoading: false,
      data: mockTask,
      error: null,
    } as any);

    render(<A2ATaskPage />);

    const durationLabel = screen.getByText('Duration');
    const timingSection = durationLabel.closest('.space-y-2');
    expect(timingSection).toHaveTextContent('Duration-');
  });

  it('should display both timestamps correctly for a completed task', () => {
    vi.mocked(useParams).mockReturnValue({ id: 'task-1' });
    const creationTime = '2023-06-15T14:30:00Z';
    const completionTime = '2023-06-15T14:45:30Z';

    const mockTask: Partial<A2ATaskDetailResponse> = {
      name: 'Completed Task',
      taskId: 'task-1',
      metadata: {
        creationTimestamp: creationTime,
      },
      status: {
        phase: 'completed',
        completionTime: completionTime,
      },
    };

    vi.mocked(useA2ATask).mockReturnValue({
      isLoading: false,
      data: mockTask,
      error: null,
    } as any);

    render(<A2ATaskPage />);

    // Verify both timestamps are displayed
    const expectedCreationDate = new Date(creationTime).toLocaleString();
    const expectedCompletionDate = new Date(completionTime).toLocaleString();

    expect(screen.getByText(expectedCreationDate)).toBeInTheDocument();
    expect(screen.getByText(expectedCompletionDate)).toBeInTheDocument();

    // Verify duration is calculated (15 minutes 30 seconds = 930 seconds)
    const durationLabel = screen.getByText('Duration');
    const timingSection = durationLabel.closest('.space-y-2');
    expect(timingSection).toHaveTextContent('Duration930s');
  });
});
