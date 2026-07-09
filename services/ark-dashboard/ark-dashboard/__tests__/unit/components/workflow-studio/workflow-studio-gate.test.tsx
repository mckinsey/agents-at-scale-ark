import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkflowStudio } from '@/components/workflow-studio/workflow-studio';
import { getAuthorAgentPreflight } from '@/lib/services/author-agent-preflight';
import { chatService } from '@/lib/services/chat';

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
  it('shows "Fix for me" on an invalid draft and dispatches the repair turn', async () => {
    vi.mocked(chatService.startStreamChatResponse).mockResolvedValue({
      queryName: 'q',
      chunks: makeChunks([{ id: 'chatcmpl-final', ark: {} }]),
    });

    render(<WorkflowStudio mode="new" initialName="wf" />);

    await waitFor(() =>
      expect(screen.getByTestId('studio-chat-input')).not.toBeDisabled(),
    );

    fireEvent.click(screen.getByTestId('studio-view-yaml'));
    fireEvent.change(screen.getByTestId('studio-yaml-editor'), {
      target: { value: 'kind: Pod\n' },
    });

    expect(await screen.findByTestId('studio-yaml-banner')).toBeInTheDocument();
    const fix = screen.getByTestId('studio-yaml-fix');
    expect(fix).not.toBeDisabled();

    fireEvent.click(fix);

    await waitFor(() =>
      expect(chatService.startStreamChatResponse).toHaveBeenCalled(),
    );
    const dispatched = vi.mocked(chatService.startStreamChatResponse).mock
      .calls[0][0];
    expect(dispatched).toContain('Fix the YAML errors for me');
  });

  it('disables "Fix for me" while a turn is building', async () => {
    let release: () => void = () => {};
    const gateStream = new Promise<void>(resolve => {
      release = resolve;
    });
    vi.mocked(chatService.startStreamChatResponse).mockImplementation(
      async () => {
        await gateStream;
        return { queryName: 'q', chunks: makeChunks([]) };
      },
    );

    render(<WorkflowStudio mode="new" initialName="wf" />);

    await waitFor(() =>
      expect(screen.getByTestId('studio-chat-input')).not.toBeDisabled(),
    );

    fireEvent.click(screen.getByTestId('studio-view-yaml'));
    fireEvent.change(screen.getByTestId('studio-yaml-editor'), {
      target: { value: 'kind: Pod\n' },
    });

    const fix = await screen.findByTestId('studio-yaml-fix');
    fireEvent.click(fix);

    await waitFor(() =>
      expect(screen.getByTestId('studio-yaml-fix')).toBeDisabled(),
    );

    release();
  });
});
