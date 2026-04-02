import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { A2AServersSection } from '@/components/sections/a2a-servers-section';
import { A2AServersService } from '@/lib/services';
import type { A2AServer } from '@/lib/services';
import { toast } from 'sonner';

vi.mock('@/lib/services', () => ({
  A2AServersService: {
    getAll: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/hooks', () => ({
  useDelayedLoading: vi.fn((loading) => loading),
}));

vi.mock('@/components/cards', () => ({
  A2AServerCard: vi.fn(({ a2aServer, onInfo, onDelete }) => (
    <div data-testid="a2a-server-card">
      <div>{a2aServer.name}</div>
      <button onClick={() => onInfo(a2aServer)}>Info</button>
      <button onClick={() => onDelete(a2aServer.id)}>Delete</button>
    </div>
  )),
}));

vi.mock('@/components/dialogs/info-dialog', () => ({
  InfoDialog: vi.fn(({ open, title }) =>
    open ? <div data-testid="info-dialog">{title}</div> : null
  ),
}));

vi.mock('@/components/editors/a2a-editor', () => ({
  A2AEditor: vi.fn(({ open, onSave }) =>
    open ? (
      <div data-testid="a2a-editor">
        <button
          onClick={() =>
            onSave({
              name: 'new-server',
              namespace: 'default',
              spec: { address: { value: 'http://test.com' } },
            })
          }>
          Save
        </button>
      </div>
    ) : null
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: vi.fn(({ children, onClick, asChild }) => {
    if (asChild) {
      return <div>{children}</div>;
    }
    return <button onClick={onClick}>{children}</button>;
  }),
}));

vi.mock('@/components/ui/empty', () => ({
  Empty: ({ children }: { children: React.ReactNode }) => <div data-testid="empty">{children}</div>,
  EmptyHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  EmptyMedia: ({ children }: { children: React.ReactNode; variant?: string }) => <div>{children}</div>,
  EmptyTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  EmptyDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  EmptyContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/lib/constants', () => ({
  DASHBOARD_SECTIONS: {
    a2a: {
      icon: () => <div>IconMock</div>,
    },
  },
}));

describe('A2AServersSection', () => {
  const mockServers: A2AServer[] = [
    {
      id: 'server-1',
      name: 'test-server-1',
      namespace: 'default',
      ready: true,
      address: 'http://test1.com',
    },
    {
      id: 'server-2',
      name: 'test-server-2',
      namespace: 'default',
      ready: false,
      address: 'http://test2.com',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display loading state initially', async () => {
    vi.mocked(A2AServersService.getAll).mockImplementation(
      () => new Promise(() => {})
    );

    render(<A2AServersSection namespace="default" />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should load and display A2A servers', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue(mockServers);

    render(<A2AServersSection namespace="default" />);

    await waitFor(() => {
      expect(screen.getByText('test-server-1')).toBeInTheDocument();
      expect(screen.getByText('test-server-2')).toBeInTheDocument();
    });
  });

  it('should display empty state when no servers', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue([]);

    render(<A2AServersSection namespace="default" />);

    await waitFor(() => {
      expect(screen.getByTestId('empty')).toBeInTheDocument();
      expect(screen.getByText('No A2A Servers Yet')).toBeInTheDocument();
    });
  });

  it('should show error toast when loading fails', async () => {
    const error = new Error('Failed to fetch');
    vi.mocked(A2AServersService.getAll).mockRejectedValue(error);

    render(<A2AServersSection namespace="default" />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to Load A2A Servers', {
        description: 'Failed to fetch',
      });
    });
  });

  it('should open info dialog when info button clicked', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue(mockServers);

    render(<A2AServersSection namespace="default" />);

    await waitFor(() => {
      expect(screen.getByText('test-server-1')).toBeInTheDocument();
    });

    const infoButtons = screen.getAllByText('Info');
    await userEvent.click(infoButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('info-dialog')).toBeInTheDocument();
      expect(screen.getByText('A2A Server: test-server-1')).toBeInTheDocument();
    });
  });

  it('should handle delete successfully', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue(mockServers);
    vi.mocked(A2AServersService.delete).mockResolvedValue();

    render(<A2AServersSection namespace="default" />);

    await waitFor(() => {
      expect(screen.getByText('test-server-1')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Delete');
    await userEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(A2AServersService.delete).toHaveBeenCalledWith('server-1');
      expect(toast.success).toHaveBeenCalledWith('A2A Server Deleted', {
        description: 'Successfully deleted test-server-1',
      });
    });
  });

  it('should show error toast when delete fails', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue(mockServers);
    const error = new Error('Delete failed');
    vi.mocked(A2AServersService.delete).mockRejectedValue(error);

    render(<A2AServersSection namespace="default" />);

    await waitFor(() => {
      expect(screen.getByText('test-server-1')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Delete');
    await userEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to Delete A2A Server', {
        description: 'Delete failed',
      });
    });
  });

  it('should open editor from empty state', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue([]);

    render(<A2AServersSection namespace="default" />);

    await waitFor(() => {
      expect(screen.getByText('No A2A Servers Yet')).toBeInTheDocument();
    });

    const addButton = screen.getByText('Add A2A Server');
    await userEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByTestId('a2a-editor')).toBeInTheDocument();
    });
  });

  it('should handle create successfully', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue([]);
    vi.mocked(A2AServersService.create).mockResolvedValue({
      id: 'new-id',
      name: 'new-server',
      namespace: 'default',
    });

    render(<A2AServersSection namespace="default" />);

    await waitFor(() => {
      expect(screen.getByText('No A2A Servers Yet')).toBeInTheDocument();
    });

    const addButton = screen.getByText('Add A2A Server');
    await userEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByTestId('a2a-editor')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save');
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(A2AServersService.create).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('A2A Server Created', {
        description: 'Successfully created new-server',
      });
    });
  });

  it('should show error toast when create fails', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue([]);
    const error = new Error('Create failed');
    vi.mocked(A2AServersService.create).mockRejectedValue(error);

    render(<A2AServersSection namespace="default" />);

    await waitFor(() => {
      expect(screen.getByText('No A2A Servers Yet')).toBeInTheDocument();
    });

    const addButton = screen.getByText('Add A2A Server');
    await userEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByTestId('a2a-editor')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save');
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to Create A2A Server', {
        description: 'Create failed',
      });
    });
  });
});
