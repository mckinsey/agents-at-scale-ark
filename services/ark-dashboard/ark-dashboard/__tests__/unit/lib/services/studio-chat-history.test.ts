import { beforeEach, describe, expect, it, vi } from 'vitest';

import { brokerSessionsService } from '@/lib/services/broker-sessions';
import type { BrokerSession } from '@/lib/services/broker-sessions';
import { conversationsService } from '@/lib/services/conversations';
import type { ConversationMessage } from '@/lib/services/conversations';
import { studioChatHistoryService } from '@/lib/services/studio-chat-history';

vi.mock('@/lib/services/broker-sessions', () => ({
  brokerSessionsService: {
    getSession: vi.fn(),
  },
}));

vi.mock('@/lib/services/conversations', () => ({
  conversationsService: {
    getMessages: vi.fn(),
  },
}));

function session(conversations: BrokerSession['conversations']): BrokerSession {
  return {
    sessionId: 'argo-make-default-my-workflow',
    name: 'my-workflow',
    status: 'idle',
    errorCount: 0,
    participants: [],
    conversations,
    conversationCount: conversations?.length ?? 0,
    createdAt: '2026-01-01T00:00:00Z',
    lastActivity: '2026-01-02T00:00:00Z',
  };
}

function conversation(conversationId: string, startTime: string) {
  return {
    conversationId,
    name: conversationId,
    participants: [],
    messageCount: 1,
    duration: '1m',
    startTime,
    participantType: 'agent' as const,
    errorCount: 0,
  };
}

function message(content: string): ConversationMessage {
  return {
    timestamp: '2026-01-02T00:00:00Z',
    conversation_id: 'conv-b',
    query_id: 'q-1',
    sequence: 1,
    message: { role: 'assistant', content },
  };
}

describe('studioChatHistoryService.load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads messages for the most recent conversation', async () => {
    vi.mocked(brokerSessionsService.getSession).mockResolvedValueOnce(
      session([
        conversation('conv-a', '2026-01-01T00:00:00Z'),
        conversation('conv-b', '2026-01-05T00:00:00Z'),
      ]),
    );
    vi.mocked(conversationsService.getMessages).mockResolvedValueOnce([
      message('latest reply'),
    ]);

    const result = await studioChatHistoryService.load(
      'argo-make-default-my-workflow',
    );

    expect(conversationsService.getMessages).toHaveBeenCalledWith('conv-b');
    expect(result).toEqual({
      conversationId: 'conv-b',
      messages: [message('latest reply')],
    });
  });

  it('keeps the latest when the current startTime is not parseable', async () => {
    vi.mocked(brokerSessionsService.getSession).mockResolvedValueOnce(
      session([
        conversation('conv-a', '2026-01-01T00:00:00Z'),
        conversation('conv-b', 'not-a-date'),
      ]),
    );
    vi.mocked(conversationsService.getMessages).mockResolvedValueOnce([
      message('reply'),
    ]);

    await studioChatHistoryService.load('argo-make');

    expect(conversationsService.getMessages).toHaveBeenCalledWith('conv-a');
  });

  it('takes the current when the latest startTime is not parseable', async () => {
    vi.mocked(brokerSessionsService.getSession).mockResolvedValueOnce(
      session([
        conversation('conv-a', 'not-a-date'),
        conversation('conv-b', '2026-01-05T00:00:00Z'),
      ]),
    );
    vi.mocked(conversationsService.getMessages).mockResolvedValueOnce([
      message('reply'),
    ]);

    await studioChatHistoryService.load('argo-make');

    expect(conversationsService.getMessages).toHaveBeenCalledWith('conv-b');
  });

  it('returns null when the session is missing', async () => {
    vi.mocked(brokerSessionsService.getSession).mockResolvedValueOnce(null);

    const result = await studioChatHistoryService.load('missing');

    expect(result).toBeNull();
    expect(conversationsService.getMessages).not.toHaveBeenCalled();
  });

  it('returns null when the session has no conversations', async () => {
    vi.mocked(brokerSessionsService.getSession).mockResolvedValueOnce(
      session([]),
    );

    const result = await studioChatHistoryService.load('missing');

    expect(result).toBeNull();
    expect(conversationsService.getMessages).not.toHaveBeenCalled();
  });

  it('returns null when the latest conversation has no messages', async () => {
    vi.mocked(brokerSessionsService.getSession).mockResolvedValueOnce(
      session([conversation('conv-a', '2026-01-01T00:00:00Z')]),
    );
    vi.mocked(conversationsService.getMessages).mockResolvedValueOnce([]);

    const result = await studioChatHistoryService.load('argo-make');

    expect(result).toBeNull();
  });

  it('returns null when loading the session throws', async () => {
    vi.mocked(brokerSessionsService.getSession).mockRejectedValueOnce(
      new Error('not found'),
    );

    const result = await studioChatHistoryService.load('argo-make');

    expect(result).toBeNull();
  });
});
