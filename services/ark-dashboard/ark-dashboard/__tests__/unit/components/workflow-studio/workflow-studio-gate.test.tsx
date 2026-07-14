import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StudioChatGate } from '@/components/workflow-studio/studio-chat-gate';
import { WorkflowStudio } from '@/components/workflow-studio/workflow-studio';
import {
  ARGO_MAKE_AUTHOR_AGENT_NAME,
  ARGO_MAKE_AUTHOR_MARKETPLACE_URL,
  KUBERNETES_MCP_MARKETPLACE_URL,
} from '@/lib/constants/argo-make';
import { getAuthorAgentPreflight } from '@/lib/services/author-agent-preflight';

const pushMock = vi.fn();
const replaceMock = vi.fn();

let currentNamespace = 'default';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ namespace: currentNamespace }),
}));

vi.mock('@/lib/services/author-agent-preflight', () => ({
  getAuthorAgentPreflight: vi.fn(),
}));

vi.mock('@/lib/services/chat', () => ({
  chatService: {
    startStreamChatResponse: vi.fn(),
  },
}));

vi.mock('@/lib/services/workflow-templates', () => ({
  workflowTemplatesService: {
    getYaml: vi.fn(),
    save: vi.fn(),
    nameExists: vi.fn(),
  },
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/workflow-dag-viewer', () => ({
  WorkflowDagViewer: ({ manifest }: { manifest: string }) => (
    <div data-testid="dag-viewer">{manifest}</div>
  ),
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const preflightMock = vi.mocked(getAuthorAgentPreflight);

const present = {
  agentPresent: true,
  agentReady: true,
  mcpServerPresent: true,
  mcpServerReady: true,
};

const validYaml = [
  'apiVersion: argoproj.io/v1alpha1',
  'kind: WorkflowTemplate',
  'metadata:',
  '  name: placeholder',
  'spec:',
  '  entrypoint: main',
  '  templates:',
  '    - name: main',
].join('\n');

beforeEach(() => {
  vi.clearAllMocks();
  currentNamespace = 'default';
  preflightMock.mockResolvedValue(present);
});

describe('WorkflowStudio author-agent gate', () => {
  it('links to the marketplace and disables the composer when the agent is missing', async () => {
    preflightMock.mockResolvedValue({
      agentPresent: false,
      agentReady: false,
      mcpServerPresent: true,
      mcpServerReady: true,
    });

    render(<WorkflowStudio mode="new" initialName="wf" />);

    await waitFor(() =>
      expect(screen.getByTestId('studio-chat-gate')).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId('studio-gate-agent-marketplace-link'),
    ).toHaveAttribute('href', ARGO_MAKE_AUTHOR_MARKETPLACE_URL);
    expect(screen.getByTestId('studio-chat-input')).toBeDisabled();
  });

  it('links to the agent (not the marketplace) when the agent is present but not ready', async () => {
    preflightMock.mockResolvedValue({
      agentPresent: true,
      agentReady: false,
      mcpServerPresent: true,
      mcpServerReady: true,
    });

    render(<WorkflowStudio mode="new" initialName="wf" />);

    await waitFor(() =>
      expect(
        screen.getByTestId('studio-gate-step-agent-not-ready'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('studio-gate-step-agent-missing')).toBeNull();
    expect(screen.getByTestId('studio-gate-go-to-agent')).toHaveAttribute(
      'href',
      `/agents/${ARGO_MAKE_AUTHOR_AGENT_NAME}`,
    );
    expect(screen.getByTestId('studio-chat-input')).toBeDisabled();
  });

  it('links to the marketplace when the MCP server is missing', async () => {
    preflightMock.mockResolvedValue({
      agentPresent: true,
      agentReady: true,
      mcpServerPresent: false,
      mcpServerReady: false,
    });

    render(<WorkflowStudio mode="new" initialName="wf" />);

    await waitFor(() =>
      expect(
        screen.getByTestId('studio-gate-step-mcp-missing'),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId('studio-gate-mcp-marketplace-link'),
    ).toHaveAttribute('href', KUBERNETES_MCP_MARKETPLACE_URL);
    expect(screen.getByTestId('studio-chat-input')).toBeDisabled();
  });

  it('links to the MCP server (not the marketplace) when it is present but not ready', async () => {
    preflightMock.mockResolvedValue({
      agentPresent: true,
      agentReady: true,
      mcpServerPresent: true,
      mcpServerReady: false,
    });

    render(<WorkflowStudio mode="new" initialName="wf" />);

    await waitFor(() =>
      expect(
        screen.getByTestId('studio-gate-step-mcp-not-ready'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('studio-gate-step-mcp-missing')).toBeNull();
    expect(screen.getByTestId('studio-gate-go-to-mcp')).toHaveAttribute(
      'href',
      '/mcp',
    );
    expect(screen.getByTestId('studio-chat-input')).toBeDisabled();
  });

  it('renders no overlay and enables the composer when everything is present', async () => {
    render(<WorkflowStudio mode="new" initialName="wf" />);

    await waitFor(() =>
      expect(screen.getByTestId('studio-chat-input')).not.toBeDisabled(),
    );
    expect(screen.queryByTestId('studio-chat-gate')).toBeNull();
  });

  it('fails closed (gated) when the preflight throws', async () => {
    preflightMock.mockRejectedValue(new Error('boom'));

    render(<WorkflowStudio mode="new" initialName="wf" />);

    await waitFor(() =>
      expect(screen.getByTestId('studio-chat-gate')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('studio-chat-input')).toBeDisabled();
  });

  it('re-runs the preflight when the namespace changes', async () => {
    const { rerender } = render(<WorkflowStudio mode="new" initialName="wf" />);

    await waitFor(() => expect(preflightMock).toHaveBeenCalledTimes(1));

    currentNamespace = 'other';
    rerender(<WorkflowStudio mode="new" initialName="wf" />);

    await waitFor(() => expect(preflightMock).toHaveBeenCalledTimes(2));
  });

  it('keeps the YAML editor, diagram, and save usable while gated', async () => {
    preflightMock.mockResolvedValue({
      agentPresent: false,
      agentReady: false,
      mcpServerPresent: false,
      mcpServerReady: false,
    });

    render(<WorkflowStudio mode="new" initialName="wf" />);

    await waitFor(() =>
      expect(screen.getByTestId('studio-chat-gate')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId('studio-view-yaml'));
    const editor = screen.getByTestId('studio-yaml-editor');
    expect(editor).not.toBeDisabled();
    fireEvent.change(editor, { target: { value: validYaml } });

    expect(screen.getByTestId('studio-save')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('studio-view-diagram'));
    expect(screen.getByTestId('dag-viewer')).toBeInTheDocument();
  });
});

describe('WorkflowStudio YAML validation banner', () => {
  it('shows the validation banner on an invalid draft', async () => {
    render(<WorkflowStudio mode="new" initialName="wf" />);

    await waitFor(() =>
      expect(screen.getByTestId('studio-chat-input')).not.toBeDisabled(),
    );

    fireEvent.click(screen.getByTestId('studio-view-yaml'));
    fireEvent.change(screen.getByTestId('studio-yaml-editor'), {
      target: { value: 'kind: Pod\n' },
    });

    expect(await screen.findByTestId('studio-yaml-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('studio-yaml-fix')).not.toBeInTheDocument();
  });
});

describe('StudioChatGate', () => {
  it('renders the disabled card with heading and lead', () => {
    render(
      <StudioChatGate
        agentMissing
        agentNotReady={false}
        mcpMissing
        mcpNotReady={false}
      />,
    );

    expect(screen.getByTestId('studio-chat-gate')).toBeInTheDocument();
    expect(
      screen.getByText('Chat with the agent is disabled'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Complete both steps, then reload the page to start chatting with the builder agent:',
      ),
    ).toBeInTheDocument();
  });

  it('always renders both checklist items with the MCP server first', () => {
    render(
      <StudioChatGate
        agentMissing
        agentNotReady={false}
        mcpMissing
        mcpNotReady={false}
      />,
    );

    const mcpItem = screen.getByTestId('studio-gate-item-mcp');
    const agentItem = screen.getByTestId('studio-gate-item-agent');
    expect(mcpItem).toBeInTheDocument();
    expect(agentItem).toBeInTheDocument();
    expect(mcpItem.compareDocumentPosition(agentItem)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('marks a satisfied item done and only shows remediation for the unmet one', () => {
    render(
      <StudioChatGate
        agentMissing
        agentNotReady={false}
        mcpMissing={false}
        mcpNotReady={false}
      />,
    );

    expect(screen.getByTestId('studio-gate-item-mcp-done')).toBeInTheDocument();
    expect(screen.queryByTestId('studio-gate-item-agent-done')).toBeNull();
    expect(
      screen.getByTestId('studio-gate-step-agent-missing'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('studio-gate-step-mcp-missing')).toBeNull();
  });

  it('links to the marketplace when the agent is missing', () => {
    render(
      <StudioChatGate
        agentMissing
        agentNotReady={false}
        mcpMissing={false}
        mcpNotReady={false}
      />,
    );

    const link = screen.getByTestId('studio-gate-agent-marketplace-link');
    expect(link).toHaveAttribute('href', ARGO_MAKE_AUTHOR_MARKETPLACE_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('links to the marketplace when the MCP server is missing', () => {
    render(
      <StudioChatGate
        agentMissing={false}
        agentNotReady={false}
        mcpMissing
        mcpNotReady={false}
      />,
    );

    const link = screen.getByTestId('studio-gate-mcp-marketplace-link');
    expect(link).toHaveAttribute('href', KUBERNETES_MCP_MARKETPLACE_URL);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('links to the MCP server page when it is present but not ready', () => {
    render(
      <StudioChatGate
        agentMissing={false}
        agentNotReady={false}
        mcpMissing={false}
        mcpNotReady
      />,
    );

    expect(
      screen.getByTestId('studio-gate-step-mcp-not-ready'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('studio-gate-go-to-mcp')).toHaveAttribute(
      'href',
      '/mcp',
    );
  });

  it('links to the agent page (not the marketplace) when the agent is present but not ready', () => {
    render(
      <StudioChatGate
        agentMissing={false}
        agentNotReady
        mcpMissing={false}
        mcpNotReady={false}
      />,
    );

    expect(
      screen.getByTestId('studio-gate-step-agent-not-ready'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('studio-gate-step-agent-missing')).toBeNull();
    expect(screen.getByTestId('studio-gate-go-to-agent')).toHaveAttribute(
      'href',
      `/agents/${ARGO_MAKE_AUTHOR_AGENT_NAME}`,
    );
  });
});
