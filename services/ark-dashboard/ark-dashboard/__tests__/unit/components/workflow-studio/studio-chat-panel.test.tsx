import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StudioChatPanel } from '@/components/workflow-studio/studio-chat-panel';
import { useStudioChat } from '@/components/workflow-studio/use-studio-chat';
import { ARGO_MAKE_AUTHOR_AGENT_NAME } from '@/lib/constants/argo-make';
import { chatService } from '@/lib/services/chat';

vi.mock('@/lib/services/chat', () => ({
  chatService: {
    startStreamChatResponse: vi.fn(),
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
          gated={false}
          agentMissing={false}
          agentNotReady={false}
          mcpMissing={false}
          mcpNotReady={false}
        />
      </>
    );
  }

  render(<Harness />);
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
        .calls[0][0];
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
        .calls[0][0];
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
        .calls[0][0];
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
    it('locks the composer with unsaved hand edits and unlocks after save', async () => {
      renderPanel({
        draft: validYaml,
        lastAgent: validYaml,
        handEdited: true,
        isDirty: true,
      });

      expect(screen.getByTestId('studio-composer-lock')).toHaveTextContent(
        'Save your YAML changes to continue chatting',
      );
      expect(screen.getByTestId('studio-chat-input')).toBeDisabled();

      fireEvent.click(screen.getByTestId('harness-save'));

      await waitFor(() =>
        expect(screen.getByTestId('studio-chat-input')).not.toBeDisabled(),
      );
      expect(screen.queryByTestId('studio-composer-lock')).toBeNull();
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
        vi.mocked(chatService.startStreamChatResponse).mock.calls[1][4],
      ).toBe('conv-1');
      await waitForTurnComplete();

      fireEvent.click(screen.getByTestId('studio-new-conversation'));
      expect(screen.getByTestId('studio-chat-empty')).toBeInTheDocument();

      typeAndSend('third message');
      await waitFor(() =>
        expect(chatService.startStreamChatResponse).toHaveBeenCalledTimes(3),
      );
      expect(
        vi.mocked(chatService.startStreamChatResponse).mock.calls[2][4],
      ).toBeUndefined();
    });
  });
});
