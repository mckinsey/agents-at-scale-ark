'use client';

import type { RefObject } from 'react';
import { useCallback } from 'react';

import { chatService } from '@/lib/services';
import type { ExtendedChatMessage } from '@/lib/types/chat-message';
import {
  buildCascadingApprovalMessage,
  findTurnStartIndex,
  stripEmptyAssistantPlaceholder,
} from '@/lib/utils/chat-turn';

export interface PendingApprovalQuery {
  queryName: string;
  messageIndex: number;
}

type QueryStatusWithA2ATask = { response?: { a2a?: { taskId?: string } } };

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
      const query = await chatService.getQuery(namespace, queryName);
      const status = query?.status as QueryStatusWithA2ATask | undefined;
      const taskId = status?.response?.a2a?.taskId;
      if (!taskId) return false;

      const a2aTask = await chatService.getA2ATask(
        namespace,
        `a2a-task-${taskId}`,
      );
      const message = buildCascadingApprovalMessage(
        a2aTask,
        queryName,
        query?.namespace || namespace,
        taskId,
      );
      if (!message) return false;

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
