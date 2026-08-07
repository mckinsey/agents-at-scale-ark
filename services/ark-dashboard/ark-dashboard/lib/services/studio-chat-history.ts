import {
  type ConversationSummary,
  brokerSessionsService,
} from './broker-sessions';
import {
  type ConversationMessage,
  conversationsService,
} from './conversations';

export interface StudioChatHistory {
  conversationId: string;
  messages: ConversationMessage[];
}

function pickLatestConversation(
  conversations: ConversationSummary[],
): ConversationSummary | null {
  if (conversations.length === 0) {
    return null;
  }
  return conversations.reduce((latest, current) => {
    const latestTime = Date.parse(latest.startTime);
    const currentTime = Date.parse(current.startTime);
    if (Number.isNaN(currentTime)) {
      return latest;
    }
    if (Number.isNaN(latestTime)) {
      return current;
    }
    return currentTime > latestTime ? current : latest;
  }, conversations[0]);
}

export const studioChatHistoryService = {
  async load(sessionId: string): Promise<StudioChatHistory | null> {
    try {
      const session = await brokerSessionsService.getSession(sessionId);
      const latest = pickLatestConversation(session?.conversations ?? []);
      if (!latest) {
        return null;
      }
      const messages = await conversationsService.getMessages(
        latest.conversationId,
      );
      if (messages.length === 0) {
        return null;
      }
      return { conversationId: latest.conversationId, messages };
    } catch {
      return null;
    }
  },
};
