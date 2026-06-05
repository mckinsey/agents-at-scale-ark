import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentsAPIDialog } from '@/components/dialogs/agents-api-dialog';
import type { Agent } from '@/lib/services';

const mockCopy = vi.fn();
const mockGetAll = vi.fn();

vi.mock('copy-to-clipboard', () => ({
  default: (text: string) => {
    mockCopy(text);
    return true;
  },
}));

vi.mock('@/lib/services', () => ({
  agentsService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
  },
}));

const mockAgents: Agent[] = [
  { id: '1', name: 'test-agent', description: 'Test agent' } as Agent,
  { id: '2', name: 'another-agent', description: 'Another agent' } as Agent,
];

const mockOnOpenChange = vi.fn();

const renderDialog = (open = true) =>
  render(<AgentsAPIDialog open={open} onOpenChange={mockOnOpenChange} />);

const renderLoaded = async () => {
  const utils = renderDialog(true);
  await screen.findByText(/"name": "test-agent"/);
  return utils;
};

describe('AgentsAPIDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue(mockAgents);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'http://localhost:3000' },
    });
  });

  it('renders the dialog when open', async () => {
    await renderLoaded();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('API Access')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Use the Query API to chat with your agents from external systems.',
      ),
    ).toBeInTheDocument();
  });

  it('does not render the dialog when closed', () => {
    renderDialog(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockGetAll).not.toHaveBeenCalled();
  });

  it('fetches agents and selects the first one by default', async () => {
    await renderLoaded();

    expect(mockGetAll).toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveTextContent('test-agent');
  });

  it('displays the external endpoint by default', async () => {
    await renderLoaded();

    expect(
      screen.getByText('http://localhost:3000/api/v1/queries/'),
    ).toBeInTheDocument();
    expect(screen.getByText('Cluster internal')).toBeInTheDocument();
  });

  it('toggles between external and internal endpoints', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    expect(
      screen.getByText('http://localhost:3000/api/v1/queries/'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('switch'));

    expect(
      screen.getByText(
        'http://ark-api.<namespace>.svc.cluster.local/api/v1/queries/',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        content =>
          content.includes('Replace') &&
          content.includes('namespace') &&
          content.includes('Ark is deployed'),
      ),
    ).toBeInTheDocument();
  });

  it('copies the endpoint to the clipboard', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    const copyButton = screen.getByRole('button', { name: 'Copy endpoint' });
    const initialIcon = copyButton.querySelector('path')?.getAttribute('d');

    await user.click(copyButton);

    expect(mockCopy).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/queries/',
    );
    await waitFor(() => {
      expect(copyButton.querySelector('path')?.getAttribute('d')).not.toBe(
        initialIcon,
      );
    });
  });

  it('renders all code example tabs', async () => {
    await renderLoaded();

    expect(screen.getByRole('tab', { name: 'Python' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Go' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Bash' })).toBeInTheDocument();
  });

  it('shows Python code with the selected agent by default', async () => {
    await renderLoaded();

    expect(screen.getByText(/import requests/)).toBeInTheDocument();
    expect(screen.getByText(/"name": "test-agent"/)).toBeInTheDocument();
  });

  it('switches between code examples', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole('tab', { name: 'Go' }));
    expect(screen.getByText(/package main/)).toBeInTheDocument();
    expect(screen.getByText(/"name": "test-agent"/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Bash' }));
    expect(screen.getByText(/curl -X POST/)).toBeInTheDocument();
  });

  it('copies the code for the active tab', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole('button', { name: 'Copy code' }));

    expect(mockCopy).toHaveBeenCalled();
    const copied = mockCopy.mock.calls[0][0];
    expect(copied).toContain('import requests');
    expect(copied).toContain('"name": "test-agent"');
  });

  it('copies the correct code after switching tabs', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole('tab', { name: 'Go' }));
    await user.click(screen.getByRole('button', { name: 'Copy code' }));

    const copied = mockCopy.mock.calls[0][0];
    expect(copied).toContain('package main');
    expect(copied).toContain('"name": "test-agent"');
  });

  it('reflects the internal endpoint in the code examples', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('tab', { name: 'Go' }));

    const codeBlock = screen.getByText(/package main/).closest('pre');
    expect(codeBlock?.textContent).toContain(
      'http://ark-api.<namespace>.svc.cluster.local/api/v1/queries/',
    );
  });

  it('calls onOpenChange when the dialog is closed', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    await user.click(screen.getByRole('button', { name: /close/i }));

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('handles an empty agents list', async () => {
    mockGetAll.mockResolvedValue([]);
    renderDialog(true);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('includes the required query fields in the code examples', async () => {
    await renderLoaded();

    const pythonCode =
      screen.getByText(/import requests/).closest('pre')?.textContent || '';
    expect(pythonCode).toContain('"name": "test-agent"');
    expect(pythonCode).toContain('"input"');
    expect(pythonCode).toContain('"type": "user"');
    expect(pythonCode).toContain('"target"');
  });

  it('includes the authentication examples in the code', async () => {
    await renderLoaded();

    const pythonCode =
      screen.getByText(/import requests/).closest('pre')?.textContent || '';
    expect(pythonCode).toContain('# Uncomment to use auth with key pair');
    expect(pythonCode).toContain(
      '# auth=HTTPBasicAuth(PUBLIC_KEY, SECRET_KEY)',
    );
    expect(pythonCode).toContain('# Uncomment to use auth with bearer token');
    expect(pythonCode).toContain('# "Authorization": "Bearer YOUR_TOKEN_HERE"');
  });

  it('keeps the selected agent across tab changes', async () => {
    const user = userEvent.setup();
    await renderLoaded();

    expect(screen.getByText(/"name": "test-agent"/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Go' }));
    expect(screen.getByText(/"name": "test-agent"/)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Bash' }));
    expect(screen.getByText(/"name": "test-agent"/)).toBeInTheDocument();
  });
});
