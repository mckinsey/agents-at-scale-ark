'use client';

import { useEffect, useRef } from 'react';

import { chatService } from '@/lib/services';
import type { ChatResponse } from '@/lib/services/chat';
import type { ExtendedChatMessage } from '@/lib/types/chat-message';
import {
  buildPollResultMessages,
  findTurnStartIndex,
  stripEmptyAssistantPlaceholder,
} from '@/lib/utils/chat-turn';

export const RESUME_POLL_INTERVAL_MS = 1000;

interface ResumeRun {
  stopped: boolean;
}

interface UseResumeRunningQueryParams {
  namespace: string;
  chatKey: string;
  activeQueryName?: string;
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
  setProcessingPhase: (phase: string | undefined) => void;
  updateChatMessages: (
    updater: (prev: ExtendedChatMessage[]) => ExtendedChatMessage[],
  ) => void;
  clearActiveQuery: () => void;
  onResume: (queryName: string, stop: () => void) => void;
  restorePendingApproval: (queryName: string) => Promise<boolean>;
}

function buildResumedTurn(
  result: ChatResponse,
  queryName: string,
  currentTurn: ExtendedChatMessage[],
): ExtendedChatMessage[] {
  const resultMessages = buildPollResultMessages(result, queryName).filter(
    msg => msg.role !== 'user',
  );
  return resultMessages.length > 0
    ? resultMessages
    : stripEmptyAssistantPlaceholder(currentTurn);
}

function withoutFailedMessages(
  messages: ExtendedChatMessage[],
): ExtendedChatMessage[] {
  const turnStartIndex = findTurnStartIndex(messages);
  return [
    ...messages.slice(0, turnStartIndex),
    ...messages
      .slice(turnStartIndex)
      .filter(msg => msg.metadata?.status !== 'failed'),
  ];
}

async function hasRestoredApproval(
  restorePendingApproval: (queryName: string) => Promise<boolean>,
  queryName: string,
): Promise<boolean> {
  try {
    return await restorePendingApproval(queryName);
  } catch (err) {
    console.error('Failed to restore pending approval:', err);
    return false;
  }
}

function finishResumedQuery(
  {
    updateChatMessages,
    clearActiveQuery,
    setIsProcessing,
    setProcessingPhase,
  }: UseResumeRunningQueryParams,
  result: ChatResponse,
  queryName: string,
): void {
  updateChatMessages(prev => {
    const turnStartIndex = findTurnStartIndex(prev);
    return [
      ...prev.slice(0, turnStartIndex),
      ...buildResumedTurn(result, queryName, prev.slice(turnStartIndex)),
    ];
  });
  clearActiveQuery();
  setIsProcessing(false);
  setProcessingPhase(undefined);
}

async function resumeActiveQuery(
  params: UseResumeRunningQueryParams,
  run: ResumeRun,
): Promise<void> {
  const {
    namespace,
    activeQueryName: queryName,
    isProcessing,
    setIsProcessing,
    setProcessingPhase,
    updateChatMessages,
    onResume,
    restorePendingApproval,
  } = params;
  if (!queryName || isProcessing) return;

  onResume(queryName, () => {
    run.stopped = true;
  });
  setIsProcessing(true);
  updateChatMessages(withoutFailedMessages);

  while (!run.stopped) {
    const result = await chatService.getQueryResult(namespace, queryName);
    if (run.stopped) return;

    if (result.transportError) {
      await new Promise(resolve =>
        setTimeout(resolve, RESUME_POLL_INTERVAL_MS),
      );
      continue;
    }

    if (result.terminal) {
      finishResumedQuery(params, result, queryName);
      return;
    }

    if (
      result.status === 'input-required' &&
      (await hasRestoredApproval(restorePendingApproval, queryName))
    ) {
      setIsProcessing(false);
      setProcessingPhase(undefined);
      return;
    }

    setProcessingPhase(result.status);
    await new Promise(resolve => setTimeout(resolve, RESUME_POLL_INTERVAL_MS));
  }
}

export function useResumeRunningQuery(
  params: UseResumeRunningQueryParams,
): void {
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  });

  const { namespace, chatKey } = params;

  useEffect(() => {
    if (!namespace) return;
    const run: ResumeRun = { stopped: false };
    void resumeActiveQuery(paramsRef.current, run);
    return () => {
      run.stopped = true;
    };
  }, [namespace, chatKey]);
}
