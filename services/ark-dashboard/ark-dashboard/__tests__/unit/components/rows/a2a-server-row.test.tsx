import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { A2AServerRow } from '@/components/rows/a2a-server-row';
import type { A2AServer } from '@/lib/services';

vi.mock('@/lib/utils/icon-resolver', () => ({
  getCustomIcon: vi.fn(() => () => <div>IconMock</div>),
}));

vi.mock('@/components/dialogs/confirmation-dialog', () => ({
  ConfirmationDialog: vi.fn(({ open, title, onConfirm, confirmText }) =>
    open ? (
      <div data-testid="confirmation-dialog">
        <div>{title}</div>
        <button onClick={onConfirm}>{confirmText}</button>
      </div>
    ) : null
  ),
}));

vi.mock('@/components/ui/availability-status-badge', () => ({
  AvailabilityStatusBadge: vi.fn(({ status, eventsLink }) => (
    <a href={eventsLink} data-testid="availability-badge">
      Status: {status}
    </a>
  )),
}));

vi.mock('@/components/ui/button', () => ({
  Button: vi.fn(({ children, onClick, ...props }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  )),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { asChild?: boolean; children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip">{children}</div>,
}));

describe('A2AServerRow', () => {
  const mockA2AServer: A2AServer = {
    id: 'test-id',
    name: 'test-server',
    namespace: 'default',
    ready: true,
    address: 'http://test.example.com',
  };

  it('should render server name and address', () => {
    render(<A2AServerRow a2aServer={mockA2AServer} />);

    expect(screen.getByText('test-server')).toBeInTheDocument();
    expect(screen.getByText('http://test.example.com')).toBeInTheDocument();
  });

  it('should render availability badge with correct status for ready server', () => {
    render(<A2AServerRow a2aServer={mockA2AServer} />);

    const badge = screen.getByTestId('availability-badge');
    expect(badge).toHaveTextContent('Status: True');
  });

  it('should render availability badge with correct status for not ready server', () => {
    const notReadyServer = { ...mockA2AServer, ready: false };
    render(<A2AServerRow a2aServer={notReadyServer} />);

    const badge = screen.getByTestId('availability-badge');
    expect(badge).toHaveTextContent('Status: False');
  });

  it('should render availability badge with events link', () => {
    render(<A2AServerRow a2aServer={mockA2AServer} />);

    const link = screen.getByTestId('availability-badge');
    expect(link).toHaveAttribute('href', '/events?kind=A2AServer&name=test-server&page=1');
  });

  it('should render info button when onInfo provided', () => {
    const onInfo = vi.fn();
    render(<A2AServerRow a2aServer={mockA2AServer} onInfo={onInfo} />);

    expect(screen.getByText('View A2A server details')).toBeInTheDocument();
  });

  it('should not render info button when onInfo not provided', () => {
    render(<A2AServerRow a2aServer={mockA2AServer} />);

    expect(screen.queryByText('View A2A server details')).not.toBeInTheDocument();
  });

  it('should call onInfo when info button clicked', async () => {
    const onInfo = vi.fn();
    render(<A2AServerRow a2aServer={mockA2AServer} onInfo={onInfo} />);

    const buttons = screen.getAllByRole('button');
    const infoButton = buttons.find(btn => btn.className.includes('h-8 w-8'));
    await userEvent.click(infoButton!);

    expect(onInfo).toHaveBeenCalledWith(mockA2AServer);
  });

  it('should render delete button when onDelete provided', () => {
    const onDelete = vi.fn();
    render(<A2AServerRow a2aServer={mockA2AServer} onDelete={onDelete} />);

    expect(screen.getByText('Delete A2A server')).toBeInTheDocument();
  });

  it('should not render delete button when onDelete not provided', () => {
    render(<A2AServerRow a2aServer={mockA2AServer} />);

    expect(screen.queryByText('Delete A2A server')).not.toBeInTheDocument();
  });

  it('should show confirmation dialog on delete click', async () => {
    const onDelete = vi.fn();
    render(<A2AServerRow a2aServer={mockA2AServer} onDelete={onDelete} />);

    const buttons = screen.getAllByRole('button');
    const deleteButton = buttons.find(btn => btn.className.includes('hover:bg-destructive'));
    await userEvent.click(deleteButton!);

    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete A2A Server')).toBeInTheDocument();
  });

  it('should call onDelete with correct id when confirmed', async () => {
    const onDelete = vi.fn();
    render(<A2AServerRow a2aServer={mockA2AServer} onDelete={onDelete} />);

    const buttons = screen.getAllByRole('button');
    const deleteButton = buttons.find(btn => btn.className.includes('hover:bg-destructive'));
    await userEvent.click(deleteButton!);

    await userEvent.click(screen.getByText('Delete'));

    expect(onDelete).toHaveBeenCalledWith('test-id');
  });

  it('should display status message when present', () => {
    const serverWithMessage = {
      ...mockA2AServer,
      status_message: 'Connection error',
    };
    render(<A2AServerRow a2aServer={serverWithMessage} />);

    expect(screen.getByText('Connection error')).toBeInTheDocument();
  });

  it('should display fallback address when address not available', () => {
    const serverWithoutAddress = {
      ...mockA2AServer,
      address: undefined,
    };
    render(<A2AServerRow a2aServer={serverWithoutAddress} />);

    expect(screen.getByText('Address not available')).toBeInTheDocument();
  });

  it('should display "Unnamed Server" when name is not provided', () => {
    const serverWithoutName = {
      ...mockA2AServer,
      name: '',
    };
    render(<A2AServerRow a2aServer={serverWithoutName} />);

    expect(screen.getByText('Unnamed Server')).toBeInTheDocument();
  });
});
