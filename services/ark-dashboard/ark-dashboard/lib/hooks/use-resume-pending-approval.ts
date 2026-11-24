'use client';

import type { RefObject } from 'react';
import { useCallback } from 'react';

import type { ExtendedChatMessage } from '@/lib/types/chat-message';
import {
  findTurnStartIndex,
  loadApprovalRequestMessage,
  stripEmptyAssistantPlaceholder,
} from '@/lib/utils/chat-turn';

export interface PendingApprovalQuery {
  queryName: string;
  messageIndex: number;
}

interface UseResumePendingApprovalParams {
  namespace: string;
  getMessages: () => ExtendedChatMessage[];
  updateChatMessages: (
    updater: (prev: ExtendedChatMessage[]) => ExtendedChatMessage[],
  ) => void;
  pendingApprovalQueryRef: RefObject<PendingApprovalQuery | null>;
}

export function useResumePendingApproval({
  namespace,
  getMessages,
  updateChatMessages,
  pendingApprovalQueryRef,
}: UseResumePendingApprovalParams): (queryName: string) => Promise<boolean> {
  return useCallback(
    async (queryName: string): Promise<boolean> => {
      const approval = await loadApprovalRequestMessage(namespace, queryName);
      if (!approval) return false;
      const { taskId, message } = approval;

      const messages = getMessages();
      const turnStartIndex = findTurnStartIndex(messages);
      const alreadyShown = messages
        .slice(turnStartIndex)
        .some(msg => msg.approvalRequest?.taskId === taskId);
      if (!alreadyShown) {
        updateChatMessages(prev => [
          ...stripEmptyAssistantPlaceholder(prev),
          message,
        ]);
      }

      pendingApprovalQueryRef.current = {
        queryName,
        messageIndex: turnStartIndex,
      };
      return true;
    },
    [getMessages, namespace, pendingApprovalQueryRef, updateChatMessages],
  );
}
