import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { A2AServerCard } from '@/components/cards/a2a-server-card';
import type { A2AServer } from '@/lib/services/a2a-servers';

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

vi.mock('./base-card', () => ({
  BaseCard: vi.fn(({ title, actions, footer }) => (
    <div data-testid="base-card">
      <div>{title}</div>
      {actions.map((action: { label: string; onClick: () => void }, idx: number) => (
        <button key={idx} onClick={action.onClick} aria-label={action.label}>
          {action.label}
        </button>
      ))}
      {footer}
    </div>
  )),
}));

describe('A2AServerCard', () => {
  const mockA2AServer: A2AServer = {
    id: 'test-id',
    name: 'test-server',
    namespace: 'default',
    ready: true,
    address: 'http://test.example.com',
  };

  it('should render server name and address', () => {
    render(
      <A2AServerCard
        a2aServer={mockA2AServer}
        namespace="default"
      />
    );

    expect(screen.getByText('test-server')).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/test\.example\.com/)).toBeInTheDocument();
  });

  it('should render delete button when onDelete provided', () => {
    const onDelete = vi.fn();
    render(
      <A2AServerCard
        a2aServer={mockA2AServer}
        namespace="default"
        onDelete={onDelete}
      />
    );

    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('should not render delete button when onDelete not provided', () => {
    render(
      <A2AServerCard
        a2aServer={mockA2AServer}
        namespace="default"
      />
    );

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('should show confirmation dialog on delete click', async () => {
    const onDelete = vi.fn();
    render(
      <A2AServerCard
        a2aServer={mockA2AServer}
        namespace="default"
        onDelete={onDelete}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete A2A Server')).toBeInTheDocument();
  });

  it('should call onDelete with correct id when confirmed', async () => {
    const onDelete = vi.fn();
    render(
      <A2AServerCard
        a2aServer={mockA2AServer}
        namespace="default"
        onDelete={onDelete}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await userEvent.click(screen.getByText('Delete'));

    expect(onDelete).toHaveBeenCalledWith('test-id');
  });

  it('should render availability badge with correct status for ready server', () => {
    render(
      <A2AServerCard
        a2aServer={mockA2AServer}
        namespace="default"
      />
    );

    const badge = screen.getByTestId('availability-badge');
    expect(badge).toHaveTextContent('Status: True');
  });

  it('should render availability badge with correct status for not ready server', () => {
    const notReadyServer = { ...mockA2AServer, ready: false };
    render(
      <A2AServerCard
        a2aServer={notReadyServer}
        namespace="default"
      />
    );

    const badge = screen.getByTestId('availability-badge');
    expect(badge).toHaveTextContent('Status: False');
  });

  it('should render availability badge with events link', () => {
    render(
      <A2AServerCard
        a2aServer={mockA2AServer}
        namespace="default"
      />
    );

    const link = screen.getByTestId('availability-badge');
    expect(link).toHaveAttribute('href', '/events?kind=A2AServer&name=test-server&page=1');
  });

  it('should render info button when onInfo provided', () => {
    const onInfo = vi.fn();
    render(
      <A2AServerCard
        a2aServer={mockA2AServer}
        namespace="default"
        onInfo={onInfo}
      />
    );

    expect(screen.getByRole('button', { name: /view/i })).toBeInTheDocument();
  });

  it('should call onInfo when info button clicked', async () => {
    const onInfo = vi.fn();
    render(
      <A2AServerCard
        a2aServer={mockA2AServer}
        namespace="default"
        onInfo={onInfo}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /view/i }));

    expect(onInfo).toHaveBeenCalledWith(mockA2AServer);
  });

  it('should display status message when present', () => {
    const serverWithMessage = {
      ...mockA2AServer,
      status_message: 'Connection error',
    };
    render(
      <A2AServerCard
        a2aServer={serverWithMessage}
        namespace="default"
      />
    );

    expect(screen.getByText('Connection error')).toBeInTheDocument();
  });

  it('should display fallback address when address not available', () => {
    const serverWithoutAddress = {
      ...mockA2AServer,
      address: undefined,
    };
    render(
      <A2AServerCard
        a2aServer={serverWithoutAddress}
        namespace="default"
      />
    );

    expect(screen.getByText(/Address not available/)).toBeInTheDocument();
  });
});
