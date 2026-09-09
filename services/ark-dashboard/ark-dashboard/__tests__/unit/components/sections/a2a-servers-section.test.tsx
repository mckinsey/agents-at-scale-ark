import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { A2AServersSection } from '@/components/sections/a2a-servers-section';
import { APIError } from '@/lib/api/client';
import { A2AServersService } from '@/lib/services/a2a-servers';
import type { A2AServer } from '@/lib/services/a2a-servers';

let readOnly = false;

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'default',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: readOnly,
  }),
}));

vi.mock('@/lib/services/a2a-servers', () => ({
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
  useDelayedLoading: vi.fn(loading => loading),
}));

vi.mock('@/components/sections/a2a-servers-table', () => ({
  A2AServersTable: vi.fn(({ servers, onDelete }) => (
    <table data-testid="a2a-servers-table">
      <tbody>
        {servers.map((server: { id: string; name: string }) => (
          <tr key={server.id}>
            <td>{server.name}</td>
            <td>
              <button onClick={() => onDelete(server.id)}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )),
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
    ) : null,
  ),
}));

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <A2AServersSection />
    </QueryClientProvider>,
  );
}

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
    readOnly = false;
    vi.clearAllMocks();
  });

  it('should display loading state initially', async () => {
    vi.mocked(A2AServersService.getAll).mockImplementation(
      () => new Promise(() => {}),
    );

    renderSection();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render the page header', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue(mockServers);

    renderSection();

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'A2A servers' }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        'Register servers that host agents via the A2A protocol',
      ),
    ).toBeInTheDocument();
  });

  it('should load and display A2A servers', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue(mockServers);

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('test-server-1')).toBeInTheDocument();
      expect(screen.getByText('test-server-2')).toBeInTheDocument();
    });
  });

  it('should pass the namespace to the service', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue(mockServers);

    renderSection();

    await waitFor(() => {
      expect(A2AServersService.getAll).toHaveBeenCalledWith('default');
    });
  });

  it('should display empty state when no servers', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue([]);

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('No A2A server yet')).toBeInTheDocument();
    });
    expect(
      screen.getByText("You haven't added any A2A server yet."),
    ).toBeInTheDocument();
    expect(screen.getByText('Get started to see servers.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Learn more' })).toHaveAttribute(
      'href',
      'https://mckinsey.github.io/agents-at-scale-ark/reference/resources/a2aserver/',
    );
  });

  it('should hide the header action while the empty state is shown', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue([]);

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('No A2A server yet')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: 'Create A2A server' }),
    ).not.toBeInTheDocument();
  });

  it('should show the header action when servers exist', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue(mockServers);

    renderSection();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Create A2A server' }),
      ).toBeInTheDocument();
    });
  });

  it('should show an inline error state when the first load fails', async () => {
    const error = new APIError('Failed to fetch', 403);
    vi.mocked(A2AServersService.getAll).mockRejectedValue(error);

    renderSection();

    await waitFor(
      () => {
        expect(
          screen.getByText("Couldn't load A2A servers"),
        ).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps the loaded list visible when a refetch fails', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValueOnce(mockServers);
    vi.mocked(A2AServersService.delete).mockResolvedValue();
    vi.mocked(A2AServersService.getAll).mockRejectedValue(
      new APIError('Refresh failed', 403),
    );

    renderSection();

    await waitFor(
      () => {
        expect(screen.getByText('test-server-1')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    await userEvent.click(screen.getAllByText('Delete')[0]);

    await waitFor(
      () => {
        expect(
          screen.getByText("Couldn't refresh A2A servers"),
        ).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    expect(screen.getByTestId('a2a-servers-table')).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't load A2A servers"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('No A2A server yet')).not.toBeInTheDocument();
  });

  it('keeps the empty state when a refetch of an empty list fails', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValueOnce([]);
    vi.mocked(A2AServersService.getAll).mockRejectedValue(
      new APIError('Refresh failed', 403),
    );
    vi.mocked(A2AServersService.create).mockResolvedValue({
      id: 'new-id',
      name: 'new-server',
      namespace: 'default',
    });

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('No A2A server yet')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await userEvent.click(screen.getByText('Save'));

    await waitFor(
      () => {
        expect(
          screen.getByText("Couldn't refresh A2A servers"),
        ).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    expect(screen.getByText('No A2A server yet')).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't load A2A servers"),
    ).not.toBeInTheDocument();
  });

  it('should handle delete successfully', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue(mockServers);
    vi.mocked(A2AServersService.delete).mockResolvedValue();

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('test-server-1')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Delete');
    await userEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(A2AServersService.delete).toHaveBeenCalledWith(
        'default',
        'server-1',
      );
      expect(toast.success).toHaveBeenCalledWith('A2A Server Deleted', {
        description: 'Successfully deleted test-server-1',
      });
    });
  });

  it('should show error toast when delete fails', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue(mockServers);
    const error = new Error('Delete failed');
    vi.mocked(A2AServersService.delete).mockRejectedValue(error);

    renderSection();

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

  it('reports both results when two deletes overlap', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue(mockServers);

    let rejectFirst: (error: Error) => void = () => {};
    let resolveSecond: () => void = () => {};
    vi.mocked(A2AServersService.delete)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSecond = () => resolve();
          }),
      );

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('test-server-1')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByText('Delete');
    await userEvent.click(deleteButtons[0]);
    await userEvent.click(deleteButtons[1]);

    expect(A2AServersService.delete).toHaveBeenCalledTimes(2);

    rejectFirst(new Error('Forbidden'));
    resolveSecond();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to Delete A2A Server', {
        description: 'Forbidden',
      });
      expect(toast.success).toHaveBeenCalledWith('A2A Server Deleted', {
        description: 'Successfully deleted test-server-2',
      });
    });
  });

  it('should open editor from empty state', async () => {
    vi.mocked(A2AServersService.getAll).mockResolvedValue([]);

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('No A2A server yet')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

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

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('No A2A server yet')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

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

    renderSection();

    await waitFor(() => {
      expect(screen.getByText('No A2A server yet')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

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
