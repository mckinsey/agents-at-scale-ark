import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StudioChatPanel } from '@/components/workflow-studio/studio-chat-panel';
import { EXPERIMENTAL_NOTICE_STORAGE_KEY } from '@/components/workflow-studio/use-experimental-notice';
import { useStudioChat } from '@/components/workflow-studio/use-studio-chat';
import { ARGO_MAKE_AUTHOR_AGENT_NAME } from '@/lib/constants/argo-make';
import { chatService } from '@/lib/services/chat';
import { studioChatHistoryService } from '@/lib/services/studio-chat-history';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'default',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/lib/services/chat', () => ({
  chatService: {
    startStreamChatResponse: vi.fn(),
  },
}));

vi.mock('@/lib/services/studio-chat-history', () => ({
  studioChatHistoryService: {
    load: vi.fn(async () => null),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/navigation', async () => {
  const actual =
    await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return {
    ...actual,
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock('@/components/ui/markdown-editor', () => ({
  MarkdownEditor: ({
    value,
    onChange,
    'data-testid': dataTestId,
  }: {
    value: string;
    onChange: (value: string) => void;
    'data-testid'?: string;
  }) => (
    <textarea
      data-testid={dataTestId}
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  ),
}));

const validYaml = [
  'apiVersion: argoproj.io/v1alpha1',
  'kind: WorkflowTemplate',
  'metadata:',
  '  name: placeholder',
  'spec:',
  '  entrypoint: main',
].join('\n');

type Chunk = Record<string, unknown>;

function makeChunks(chunks: Chunk[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  })();
}

function mockStream(factory: () => Chunk[]) {
  vi.mocked(chatService.startStreamChatResponse).mockImplementation(
    async () => ({
      queryName: 'studio-query',
      chunks: makeChunks(factory()),
    }),
  );
}

const finalChunk = (conversationId = 'conv-1'): Chunk => ({
  id: 'chatcmpl-final',
  ark: {
    completedQuery: {
      status: { phase: 'done', conversationId },
    },
  },
});

const contentChunk = (content: string): Chunk => ({
  choices: [{ delta: { content } }],
});

interface HarnessOptions {
  draft?: string;
  lastAgent?: string | undefined;
  handEdited?: boolean;
  isDirty?: boolean;
  sessionId?: string;
  resumeConversation?: boolean;
  strict?: boolean;
  loading?: boolean;
  gated?: boolean;
  agentMissing?: boolean;
  agentNotReady?: boolean;
  mcpMissing?: boolean;
  mcpNotReady?: boolean;
  unverifiable?: boolean;
}

function renderPanel(options: HarnessOptions = {}) {
  const commitSpy = vi.fn();

  function Harness() {
    const [draftYaml, setDraftYaml] = useState(options.draft ?? '');
    const [lastAgentYaml, setLastAgentYaml] = useState<string | undefined>(
      options.lastAgent,
    );
    const [handEdited, setHandEdited] = useState(options.handEdited ?? false);
    const [isDirty, setIsDirty] = useState(options.isDirty ?? false);
    const [building, setBuilding] = useState(false);

    const commitAgentYaml = (value: string) => {
      commitSpy(value);
      setDraftYaml(value);
      setLastAgentYaml(value);
      setHandEdited(false);
    };

    const chat = useStudioChat({
      draftYaml,
      lastAgentYaml,
      commitAgentYaml,
      building,
      setBuilding,
      isDirty,
      handEdited,
      sessionId: options.sessionId,
      resumeConversation: options.resumeConversation,
    });

    return (
      <>
        <button
          data-testid="harness-save"
          onClick={() => {
            setHandEdited(false);
            setIsDirty(false);
          }}>
          save
        </button>
        <StudioChatPanel
          chat={chat}
          loading={options.loading ?? false}
          gated={options.gated ?? false}
          agentMissing={options.agentMissing ?? false}
          agentNotReady={options.agentNotReady ?? false}
          mcpMissing={options.mcpMissing ?? false}
          mcpNotReady={options.mcpNotReady ?? false}
          unverifiable={options.unverifiable ?? false}
        />
      </>
    );
  }

  if (options.strict) {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
  } else {
    render(<Harness />);
  }
  return { commitSpy };
}

function typeAndSend(text: string) {
  const input = screen.getByTestId('studio-chat-input');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByTestId('studio-chat-send'));
}

async function waitForTurnComplete() {
  await waitFor(() =>
    expect(screen.queryByTestId('studio-chat-typing')).toBeNull(),
  );
}

describe('StudioChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(EXPERIMENTAL_NOTICE_STORAGE_KEY, 'true');
  });

  describe('loading', () => {
    it('shows only the loader and hides the transcript and composer', () => {
      renderPanel({ loading: true });

      expect(screen.getByTestId('studio-chat-loading')).toBeInTheDocument();
      expect(screen.queryByTestId('studio-chat-empty')).not.toBeInTheDocument();
      expect(screen.queryByTestId('studio-chat-input')).not.toBeInTheDocument();
    });

    it('shows the chat UI once loading resolves', () => {
      renderPanel({ loading: false });

      expect(
        screen.queryByTestId('studio-chat-loading'),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('studio-chat-empty')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('renders the describe-your-workflow copy and suggestion chips', () => {
      renderPanel();

      const empty = screen.getByTestId('studio-chat-empty');
      expect(empty).toHaveTextContent('Describe your workflow');
      expect(empty).toHaveTextContent(
        `The ${ARGO_MAKE_AUTHOR_AGENT_NAME} agent drafts an argo workflow template live as you chat`,
      );

      expect(screen.getByTestId('studio-chat-suggestion-0')).toHaveTextContent(
        'Build a workflow to check HR tickets and categorise them',
      );
      expect(screen.getByTestId('studio-chat-suggestion-1')).toHaveTextContent(
        'Create a KYC customer onboarding workflow with 4 specialized teams',
      );
      expect(screen.getByTestId('studio-chat-suggestion-2')).toHaveTextContent(
        'Build a COBOL Modernization workflow with 3 key steps',
      );
    });

    it('fills the composer with a suggestion when the chip is clicked', () => {
      renderPanel();

      fireEvent.click(screen.getByTestId('studio-chat-suggestion-1'));

      expect(screen.getByTestId('studio-chat-input')).toHaveValue(
        'Create a KYC customer onboarding workflow with 4 specialized teams',
      );
    });
  });

  describe('sender name', () => {
    it('labels assistant messages with the author agent name', async () => {
      mockStream(() => [contentChunk('drafted it'), finalChunk()]);
      renderPanel({ draft: validYaml, lastAgent: validYaml });

      typeAndSend('build something');

      expect(
        await screen.findByText(ARGO_MAKE_AUTHOR_AGENT_NAME),
      ).toBeInTheDocument();
    });
  });

  describe('grounding', () => {
    it('sends the bare typed text when draft equals lastAgentYaml', async () => {
      mockStream(() => [contentChunk('ok'), finalChunk()]);
      renderPanel({ draft: validYaml, lastAgent: validYaml });

      typeAndSend('add a validation step');

      await waitFor(() =>
        expect(chatService.startStreamChatResponse).toHaveBeenCalled(),
      );
      const dispatched = vi.mocked(chatService.startStreamChatResponse).mock
        .calls[0][1];
      expect(dispatched).toBe('add a validation step');
      expect(dispatched).not.toContain('WorkflowTemplate');

      expect(
        await screen.findByText('add a validation step'),
      ).toBeInTheDocument();
    });

    it('prepends the draft when it diverges (fresh edit-mode load)', async () => {
      mockStream(() => [contentChunk('what should it do?'), finalChunk()]);
      renderPanel({ draft: validYaml, lastAgent: undefined });

      typeAndSend('make it faster');

      await waitFor(() =>
        expect(chatService.startStreamChatResponse).toHaveBeenCalled(),
      );
      const dispatched = vi.mocked(chatService.startStreamChatResponse).mock
        .calls[0][1];
      expect(dispatched).toContain('```yaml');
      expect(dispatched).toContain('kind: WorkflowTemplate');
      expect(dispatched).toContain('make it faster');

      expect(await screen.findByText('make it faster')).toBeInTheDocument();
      const transcript = screen.getByTestId('studio-chat-transcript');
      expect(transcript.textContent).not.toContain('kind: WorkflowTemplate');
    });

    it('prepends the draft when a saved hand-edit diverges', async () => {
      mockStream(() => [contentChunk('done'), finalChunk()]);
      renderPanel({ draft: validYaml, lastAgent: 'kind: Old\n' });

      typeAndSend('tweak it');

      await waitFor(() =>
        expect(chatService.startStreamChatResponse).toHaveBeenCalled(),
      );
      const dispatched = vi.mocked(chatService.startStreamChatResponse).mock
        .calls[0][1];
      expect(dispatched).toContain('kind: WorkflowTemplate');
      expect(dispatched).toContain('tweak it');
    });
  });

  describe('commit on completion', () => {
    it('commits once after the turn when the final text has yaml', async () => {
      mockStream(() => [
        contentChunk('Here is your workflow:\n\n```yaml\n'),
        contentChunk(`${validYaml}\n\`\`\`\n`),
        finalChunk(),
      ]);
      const { commitSpy } = renderPanel({ draft: '', lastAgent: undefined });

      typeAndSend('build me a workflow');

      await waitFor(() => expect(commitSpy).toHaveBeenCalledTimes(1));
      expect(commitSpy).toHaveBeenCalledWith(validYaml);
    });

    it('does not commit when there is no yaml fence', async () => {
      mockStream(() => [
        contentChunk('Could you clarify the goal?'),
        finalChunk(),
      ]);
      const { commitSpy } = renderPanel();

      typeAndSend('help');

      await waitForTurnComplete();
      expect(commitSpy).not.toHaveBeenCalled();
    });

    it('does not commit when the reply quotes the template in an untagged fence', async () => {
      mockStream(() => [
        contentChunk('The template already covers this:\n\n```\n'),
        contentChunk(`${validYaml}\n\`\`\`\n\nNo changes needed.`),
        finalChunk(),
      ]);
      const { commitSpy } = renderPanel({
        draft: validYaml,
        lastAgent: validYaml,
      });

      typeAndSend('does this already validate input?');

      await waitForTurnComplete();
      expect(commitSpy).not.toHaveBeenCalled();
    });

    it('surfaces an error and keeps the draft when yaml is invalid', async () => {
      mockStream(() => [
        contentChunk('```yaml\nfoo: bar: baz\n```\n'),
        finalChunk(),
      ]);
      const { commitSpy } = renderPanel();

      typeAndSend('build');

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(commitSpy).not.toHaveBeenCalled();
    });
  });

  describe('lock', () => {
    it('replaces the composer with a lock banner for unsaved hand edits and restores it after save', async () => {
      renderPanel({
        draft: validYaml,
        lastAgent: validYaml,
        handEdited: true,
        isDirty: true,
      });

      expect(screen.getByTestId('studio-composer-lock')).toHaveTextContent(
        'Save your YAML changes to continue chatting',
      );
      expect(screen.queryByTestId('studio-chat-input')).toBeNull();
      expect(screen.queryByTestId('studio-chat-send')).toBeNull();

      fireEvent.click(screen.getByTestId('harness-save'));

      await waitFor(() =>
        expect(screen.getByTestId('studio-chat-input')).toBeInTheDocument(),
      );
      expect(screen.queryByTestId('studio-composer-lock')).toBeNull();

      fireEvent.change(screen.getByTestId('studio-chat-input'), {
        target: { value: 'a message typed after unlocking' },
      });
      expect(screen.getByTestId('studio-chat-send')).not.toBeDisabled();
    });
  });

  describe('not ready gate', () => {
    it('renders warning banners instead of the install overlay when installed but not ready', () => {
      renderPanel({
        gated: true,
        agentNotReady: true,
        mcpNotReady: true,
      });

      expect(
        screen.getByTestId('studio-chat-disabled-banner'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('studio-chat-disabled-banner-agent'),
      ).toHaveTextContent('Agent has a problem, please fix to use the chat');
      expect(
        screen.getByTestId('studio-chat-disabled-banner-mcp'),
      ).toHaveTextContent('k8s mcp server has a problem, fix to use the chat');

      expect(screen.queryByTestId('studio-chat-gate')).toBeNull();
      expect(screen.getByTestId('studio-chat-send')).toBeDisabled();
      expect(screen.getByTestId('studio-chat-input')).toBeDisabled();
    });

    it('renders only the affected banner for a single not-ready dependency', () => {
      renderPanel({ gated: true, agentNotReady: true });

      expect(
        screen.getByTestId('studio-chat-disabled-banner-agent'),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('studio-chat-disabled-banner-mcp'),
      ).toBeNull();
    });

    it('keeps the install overlay when a dependency is missing', () => {
      renderPanel({ gated: true, agentMissing: true, mcpNotReady: true });

      expect(screen.getByTestId('studio-chat-gate')).toBeInTheDocument();
      expect(screen.queryByTestId('studio-chat-disabled-banner')).toBeNull();
    });

    it('shows the access-denied gate instead of install steps when unverifiable', () => {
      renderPanel({
        gated: true,
        unverifiable: true,
        agentMissing: true,
        mcpMissing: true,
      });

      expect(screen.getByTestId('studio-chat-gate')).toBeInTheDocument();
      expect(
        screen.getByTestId('studio-gate-unverifiable'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('No access to this namespace'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('studio-gate-item-agent')).toBeNull();
      expect(screen.queryByTestId('studio-chat-disabled-banner')).toBeNull();
      expect(screen.getByTestId('studio-chat-input')).toBeDisabled();
    });
  });

  describe('resume', () => {
    const historyMessage = (
      role: 'user' | 'assistant',
      content: string,
      sequence: number,
    ) => ({
      timestamp: `2026-01-0${sequence}T00:00:00Z`,
      conversation_id: 'conv-prev',
      query_id: `q-${sequence}`,
      sequence,
      message: { role, content },
    });

    it('rehydrates the transcript and strips the yaml preamble from user messages', async () => {
      vi.mocked(studioChatHistoryService.load).mockResolvedValueOnce({
        conversationId: 'conv-prev',
        messages: [
          historyMessage(
            'user',
            `Here is the current workflow template I am editing:\n\n\`\`\`yaml\n${validYaml}\n\`\`\`\n\nadd a review step`,
            1,
          ),
          historyMessage('assistant', 'done, added the review step', 2),
        ],
      });

      renderPanel({
        draft: validYaml,
        lastAgent: validYaml,
        sessionId: 'argo-make-default-my-workflow',
        resumeConversation: true,
      });

      expect(await screen.findByText('add a review step')).toBeInTheDocument();
      expect(
        screen.getByText('done, added the review step'),
      ).toBeInTheDocument();
      const transcript = screen.getByTestId('studio-chat-transcript');
      expect(transcript.textContent).not.toContain('kind: WorkflowTemplate');
    });

    it('still rehydrates under StrictMode double-invoked effects', async () => {
      vi.mocked(studioChatHistoryService.load).mockResolvedValue({
        conversationId: 'conv-prev',
        messages: [historyMessage('assistant', 'strict-mode reply', 1)],
      });

      renderPanel({
        draft: validYaml,
        lastAgent: validYaml,
        sessionId: 'argo-make-default-my-workflow',
        resumeConversation: true,
        strict: true,
      });

      expect(await screen.findByText('strict-mode reply')).toBeInTheDocument();
    });

    it('continues the resumed conversation and reuses the deterministic session id', async () => {
      vi.mocked(studioChatHistoryService.load).mockResolvedValueOnce({
        conversationId: 'conv-prev',
        messages: [historyMessage('assistant', 'earlier reply', 1)],
      });
      mockStream(() => [contentChunk('ok'), finalChunk('conv-prev')]);

      renderPanel({
        draft: validYaml,
        lastAgent: validYaml,
        sessionId: 'argo-make-default-my-workflow',
        resumeConversation: true,
      });

      expect(await screen.findByText('earlier reply')).toBeInTheDocument();

      typeAndSend('another change');

      await waitFor(() =>
        expect(chatService.startStreamChatResponse).toHaveBeenCalled(),
      );
      const call = vi.mocked(chatService.startStreamChatResponse).mock.calls[0];
      expect(call[4]).toBe('argo-make-default-my-workflow');
      expect(call[5]).toBe('conv-prev');
    });
  });

  describe('prompt editor', () => {
    it('opens the modal editor prefilled with the composer text', () => {
      renderPanel();

      fireEvent.change(screen.getByTestId('studio-chat-input'), {
        target: { value: 'draft prompt' },
      });
      fireEvent.click(screen.getByTestId('studio-chat-expand'));

      expect(screen.getByTestId('prompt-editor-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('prompt-editor-input')).toHaveValue(
        'draft prompt',
      );
    });

    it('mirrors edits into the composer and keeps them after closing', async () => {
      renderPanel();

      fireEvent.click(screen.getByTestId('studio-chat-expand'));

      fireEvent.change(screen.getByTestId('prompt-editor-input'), {
        target: { value: 'a much longer prompt written in the modal' },
      });
      expect(screen.getByTestId('studio-chat-input')).toHaveValue(
        'a much longer prompt written in the modal',
      );

      fireEvent.click(screen.getByTestId('prompt-editor-done'));

      await waitFor(() =>
        expect(screen.queryByTestId('prompt-editor-dialog')).toBeNull(),
      );
      expect(screen.getByTestId('studio-chat-input')).toHaveValue(
        'a much longer prompt written in the modal',
      );
    });
  });

  describe('experimental notice', () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    it('blocks the composer on first use and unblocks it after dismissal', async () => {
      renderPanel();

      expect(
        await screen.findByTestId('studio-experimental-notice'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('studio-chat-input')).toBeDisabled();
      expect(screen.getByTestId('studio-chat-send')).toBeDisabled();
      expect(screen.getByTestId('studio-chat-suggestion-0')).toBeDisabled();

      fireEvent.click(
        screen.getByTestId('studio-experimental-notice-dismiss'),
      );

      await waitFor(() =>
        expect(
          screen.queryByTestId('studio-experimental-notice'),
        ).toBeNull(),
      );
      expect(screen.getByTestId('studio-chat-input')).not.toBeDisabled();
      expect(screen.getByTestId('studio-chat-suggestion-0')).not.toBeDisabled();
    });

    it('stays hidden once acknowledged in localStorage', () => {
      window.localStorage.setItem(EXPERIMENTAL_NOTICE_STORAGE_KEY, 'true');
      renderPanel();

      expect(
        screen.queryByTestId('studio-experimental-notice'),
      ).toBeNull();
      expect(screen.getByTestId('studio-chat-input')).not.toBeDisabled();
    });
  });

  describe('new conversation', () => {
    it('clears the transcript and resets the conversation id', async () => {
      mockStream(() => [contentChunk('ok'), finalChunk('conv-1')]);
      renderPanel({ draft: '', lastAgent: undefined });

      typeAndSend('first message');
      await waitForTurnComplete();

      typeAndSend('second message');
      await waitFor(() =>
        expect(chatService.startStreamChatResponse).toHaveBeenCalledTimes(2),
      );
      expect(
        vi.mocked(chatService.startStreamChatResponse).mock.calls[1][5],
      ).toBe('conv-1');
      await waitForTurnComplete();

      fireEvent.click(screen.getByTestId('studio-new-conversation'));
      expect(screen.getByTestId('studio-chat-empty')).toBeInTheDocument();

      typeAndSend('third message');
      await waitFor(() =>
        expect(chatService.startStreamChatResponse).toHaveBeenCalledTimes(3),
      );
      expect(
        vi.mocked(chatService.startStreamChatResponse).mock.calls[2][5],
      ).toBeUndefined();
    });
  });
});
