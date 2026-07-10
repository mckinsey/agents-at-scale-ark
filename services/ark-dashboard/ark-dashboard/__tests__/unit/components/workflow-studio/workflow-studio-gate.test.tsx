import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StudioChatGate } from '@/components/workflow-studio/studio-chat-gate';
import { WorkflowStudio } from '@/components/workflow-studio/workflow-studio';
import {
  ARGO_MAKE_AUTHOR_AGENT_NAME,
  ARGO_MAKE_AUTHOR_INSTALL_CMD,
} from '@/lib/constants/argo-make';
import { getAuthorAgentPreflight } from '@/lib/services/author-agent-preflight';
import { chatService } from '@/lib/services/chat';
import { toast } from 'sonner';

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
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

const preflightMock = vi.mocked(getAuthorAgentPreflight);

const present = {
  agentPresent: true,
  agentReady: true,
  mcpToolsOnAgent: true,
  mcpToolCrdsPresent: true,
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

function makeChunks(chunks: Record<string, unknown>[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

beforeEach(() => {
  vi.clearAllMocks();
  currentNamespace = 'default';
  preflightMock.mockResolvedValue(present);
});

describe('WorkflowStudio author-agent gate', () => {
  it('shows the install step and disables the composer when the agent is missing', async () => {
    preflightMock.mockResolvedValue({
      agentPresent: false,
      agentReady: false,
      mcpToolsOnAgent: false,
      mcpToolCrdsPresent: false,
    });

    render(<WorkflowStudio mode="new" initialName="wf" />);

    await waitFor(() =>
      expect(screen.getByTestId('studio-chat-gate')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('studio-gate-step-agent')).toBeInTheDocument();
    expect(screen.getByTestId('studio-chat-input')).toBeDisabled();
  });

  it('shows the MCPs step (not the agent step) when only MCP is missing', async () => {
    preflightMock.mockResolvedValue({
      agentPresent: true,
      agentReady: true,
      mcpToolsOnAgent: false,
      mcpToolCrdsPresent: false,
    });

    render(<WorkflowStudio mode="new" initialName="wf" />);

    await waitFor(() =>
      expect(screen.getByTestId('studio-gate-step-mcp')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('studio-gate-step-agent')).toBeNull();

    fireEvent.click(screen.getByTestId('studio-gate-go-to-mcps'));
    expect(pushMock).toHaveBeenCalledWith('/mcp');
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
      mcpToolsOnAgent: false,
      mcpToolCrdsPresent: false,
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
  const writeTextMock = vi.fn<(value: string) => Promise<void>>();

  beforeEach(() => {
    writeTextMock.mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    });
  });

  it('renders the locked card with heading and lead', () => {
    render(<StudioChatGate agentMissing mcpMissing />);

    const gate = screen.getByTestId('studio-chat-gate');
    expect(gate).toBeInTheDocument();
    expect(
      screen.getByText('Chat with the agent is locked'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Set up this namespace to start chatting with the builder agent:',
      ),
    ).toBeInTheDocument();
  });

  it('numbers both steps sequentially when both are missing', () => {
    render(<StudioChatGate agentMissing mcpMissing />);

    const agentStep = screen.getByTestId('studio-gate-step-agent');
    const mcpStep = screen.getByTestId('studio-gate-step-mcp');

    expect(agentStep).toHaveTextContent('1');
    expect(agentStep).toHaveTextContent(
      `Install the ${ARGO_MAKE_AUTHOR_AGENT_NAME} agent`,
    );
    expect(mcpStep).toHaveTextContent('2');
    expect(mcpStep).toHaveTextContent('Add the Kubernetes MCP server');
  });

  it('numbers the sole visible step as 1 when only the agent is missing', () => {
    render(<StudioChatGate agentMissing mcpMissing={false} />);

    const agentStep = screen.getByTestId('studio-gate-step-agent');
    expect(agentStep).toHaveTextContent('1');
    expect(screen.queryByTestId('studio-gate-step-mcp')).toBeNull();
  });

  it('numbers the sole visible step as 1 when only the MCP is missing', () => {
    render(<StudioChatGate agentMissing={false} mcpMissing />);

    const mcpStep = screen.getByTestId('studio-gate-step-mcp');
    expect(mcpStep).toHaveTextContent('1');
    expect(screen.queryByTestId('studio-gate-step-agent')).toBeNull();
  });

  it('copies the install command and toasts on click', async () => {
    render(<StudioChatGate agentMissing mcpMissing={false} />);

    fireEvent.click(screen.getByTestId('studio-gate-copy'));

    await waitFor(() =>
      expect(writeTextMock).toHaveBeenCalledWith(ARGO_MAKE_AUTHOR_INSTALL_CMD),
    );
    expect(toast.success).toHaveBeenCalledWith(
      'Install command copied to clipboard.',
    );
  });

  it('navigates to MCPs from the MCP step', () => {
    render(<StudioChatGate agentMissing={false} mcpMissing />);

    fireEvent.click(screen.getByTestId('studio-gate-go-to-mcps'));
    expect(pushMock).toHaveBeenCalledWith('/mcp');
  });
});
