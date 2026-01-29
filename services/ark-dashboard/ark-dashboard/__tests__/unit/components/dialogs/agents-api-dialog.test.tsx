import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentsAPIDialog } from '@/components/dialogs/agents-api-dialog';
import type { Agent } from '@/lib/services';

const mockCopy = vi.fn();

vi.mock('copy-to-clipboard', () => ({
  default: vi.fn((text: string) => {
    mockCopy(text);
    return true;
  }),
}));

const mockAgents: Agent[] = [
  {
    id: '1',
    name: 'test-agent',
    model: { name: 'gpt-4', vendor: 'OpenAI' },
    description: 'Test agent description',
    capabilities: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    name: 'another-agent',
    model: { name: 'claude-3', vendor: 'Anthropic' },
    description: 'Another test agent',
    capabilities: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

describe('AgentsAPIDialog', () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: {
        origin: 'http://localhost:3000',
      },
      writable: true,
    });
  });

  it('should render dialog when open', () => {
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('API Access')).toBeInTheDocument();
    expect(
      screen.getByText('Use the OpenAI-compatible API to chat with your agents from external systems.')
    ).toBeInTheDocument();
  });

  it('should not render dialog when closed', () => {
    render(
      <AgentsAPIDialog
        open={false}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should render agent selector with default agent', () => {
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    const selector = screen.getByRole('combobox');
    expect(selector).toBeInTheDocument();
    expect(selector).toHaveTextContent('test-agent');
  });

  it('should display external endpoint by default', () => {
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    const endpoint = screen.getByText('http://localhost:3000/api/openai/v1/chat/completions');
    expect(endpoint).toBeInTheDocument();
    expect(screen.getByText('Cluster internal')).toBeInTheDocument();
  });

  it('should toggle between external and internal endpoints', async () => {
    const user = userEvent.setup();
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    const toggle = screen.getByRole('switch');
    // Label always shows "Cluster internal" now
    expect(screen.getByText('Cluster internal')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:3000/api/openai/v1/chat/completions')).toBeInTheDocument();

    await user.click(toggle);

    // Label remains "Cluster internal" after toggle
    expect(screen.getByText('Cluster internal')).toBeInTheDocument();
    expect(screen.getByText('http://ark-api.<namespace>.svc.cluster.local/api/openai/v1/chat/completions')).toBeInTheDocument();

    // Check for the namespace replacement instruction
    const namespaceText = screen.getByText((content, element) => {
      return content.includes('Replace') && content.includes('namespace') && content.includes('Ark is deployed');
    });
    expect(namespaceText).toBeInTheDocument();
  });

  it('should copy endpoint to clipboard', async () => {
    const user = userEvent.setup();
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    const copyButtons = screen.getAllByRole('button', { name: '' });
    const endpointCopyButton = copyButtons[0];

    await user.click(endpointCopyButton);

    expect(mockCopy).toHaveBeenCalledWith('http://localhost:3000/api/openai/v1/chat/completions');
  });

  it('should show check icon after copying endpoint', async () => {
    const user = userEvent.setup();
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    const copyButtons = screen.getAllByRole('button', { name: '' });
    const endpointCopyButton = copyButtons[0];

    expect(endpointCopyButton.querySelector('.lucide-copy')).toBeInTheDocument();

    await user.click(endpointCopyButton);

    await waitFor(() => {
      expect(endpointCopyButton.querySelector('.lucide-check')).toBeInTheDocument();
    });
  });

  it('should render all code example tabs', () => {
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    expect(screen.getByRole('tab', { name: 'Python' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Go' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Bash' })).toBeInTheDocument();
  });

  it('should display Python code by default', () => {
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    expect(screen.getByText(/import requests/)).toBeInTheDocument();
    expect(screen.getByText(/from requests.auth import HTTPBasicAuth/)).toBeInTheDocument();
    expect(screen.getByText(/"model": "agent\/test-agent"/)).toBeInTheDocument();
  });

  it('should switch between code examples', async () => {
    const user = userEvent.setup();
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    const goTab = screen.getByRole('tab', { name: 'Go' });
    await user.click(goTab);

    expect(screen.getByText(/package main/)).toBeInTheDocument();
    expect(screen.getByText(/"model": "agent\/test-agent"/)).toBeInTheDocument();

    const bashTab = screen.getByRole('tab', { name: 'Bash' });
    await user.click(bashTab);

    expect(screen.getByText(/curl -X POST/)).toBeInTheDocument();
    expect(screen.getByText(/"model": "agent\/test-agent"/)).toBeInTheDocument();
  });

  it('should display correct default agent in code examples', () => {
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    expect(screen.getByText(/"model": "agent\/test-agent"/)).toBeInTheDocument();
  });

  it('should copy code to clipboard', async () => {
    const user = userEvent.setup();
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    const copyButtons = screen.getAllByRole('button', { name: '' });
    const codeCopyButton = copyButtons[1];

    await user.click(codeCopyButton);

    expect(mockCopy).toHaveBeenCalled();
    const copiedText = mockCopy.mock.calls[0][0];
    expect(copiedText).toContain('import requests');
    expect(copiedText).toContain('"model": "agent/test-agent"');
  });

  it('should show check icon after copying code', async () => {
    const user = userEvent.setup();
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    const copyButtons = screen.getAllByRole('button', { name: '' });
    const codeCopyButton = copyButtons[1];

    expect(codeCopyButton.querySelector('.lucide-copy')).toBeInTheDocument();

    await user.click(codeCopyButton);

    await waitFor(() => {
      expect(codeCopyButton.querySelector('.lucide-check')).toBeInTheDocument();
    });
  });

  it('should copy correct code for active tab', async () => {
    const user = userEvent.setup();
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    const goTab = screen.getByRole('tab', { name: 'Go' });
    await user.click(goTab);

    const copyButtons = screen.getAllByRole('button', { name: '' });
    const codeCopyButton = copyButtons[1];

    await user.click(codeCopyButton);

    const copiedText = mockCopy.mock.calls[0][0];
    expect(copiedText).toContain('package main');
    expect(copiedText).toContain('"model": "agent/test-agent"');
  });

  it('should update endpoint when toggling internal mode', async () => {
    const user = userEvent.setup();
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    const toggle = screen.getByRole('switch');
    await user.click(toggle);

    const goTab = screen.getByRole('tab', { name: 'Go' });
    await user.click(goTab);

    const codeBlock = screen.getByText(/package main/).closest('pre');
    expect(codeBlock?.textContent).toContain('http://ark-api.<namespace>.svc.cluster.local/api/openai/v1/chat/completions');
  });

  it('should call onOpenChange when dialog is closed', async () => {
    const user = userEvent.setup();
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('should handle empty agents array', () => {
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={[]}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const selector = screen.getByRole('combobox');
    expect(selector).toBeInTheDocument();
  });

  it('should include all required fields in code examples', () => {
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    const pythonCode = screen.getByText(/import requests/).closest('pre')?.textContent || '';

    expect(pythonCode).toContain('"model": "agent/test-agent"');
    expect(pythonCode).toContain('"messages"');
    expect(pythonCode).toContain('"role": "system"');
    expect(pythonCode).toContain('"role": "user"');
    expect(pythonCode).toContain('"stream": False');
    expect(pythonCode).toContain('"temperature": 1.0');
    expect(pythonCode).toContain('"max_tokens": 1024');
    expect(pythonCode).toContain('"metadata"');
  });

  it('should include authentication examples in code', () => {
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    const pythonCode = screen.getByText(/import requests/).closest('pre')?.textContent || '';

    expect(pythonCode).toContain('# Uncomment to use auth with key pair');
    expect(pythonCode).toContain('# auth=HTTPBasicAuth(PUBLIC_KEY, SECRET_KEY)');
    expect(pythonCode).toContain('# Uncomment to use auth with bearer token');
    expect(pythonCode).toContain('# "Authorization": "Bearer YOUR_TOKEN_HERE"');
  });

  it('should maintain agent name across tab changes', async () => {
    const user = userEvent.setup();
    render(
      <AgentsAPIDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        agents={mockAgents}
      />
    );

    // Check Python tab (default)
    expect(screen.getByText(/"model": "agent\/test-agent"/)).toBeInTheDocument();

    // Switch to Go tab
    const goTab = screen.getByRole('tab', { name: 'Go' });
    await user.click(goTab);
    expect(screen.getByText(/"model": "agent\/test-agent"/)).toBeInTheDocument();

    // Switch to Bash tab
    const bashTab = screen.getByRole('tab', { name: 'Bash' });
    await user.click(bashTab);
    expect(screen.getByText(/"model": "agent\/test-agent"/)).toBeInTheDocument();
  });
});