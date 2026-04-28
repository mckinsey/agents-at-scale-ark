'use client';

import { useCallback, useEffect, useState } from 'react';

import { agentSkillAttachmentsService } from '@/lib/services/agent-skill-attachments';

export interface UseAgentSkillAttachmentsResult {
  attached: string[];
  loading: boolean;
  refresh: () => Promise<void>;
  setAttached: (skillNames: string[]) => Promise<void>;
  attach: (skillName: string) => Promise<void>;
  detach: (skillName: string) => Promise<void>;
}

export function useAgentSkillAttachments(
  agentName: string | null | undefined,
): UseAgentSkillAttachmentsResult {
  const [attached, setAttachedState] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!agentName) {
      setAttachedState([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await agentSkillAttachmentsService.getForAgent(agentName);
      setAttachedState(next);
    } finally {
      setLoading(false);
    }
  }, [agentName]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setAttached = useCallback<
    UseAgentSkillAttachmentsResult['setAttached']
  >(
    async skillNames => {
      if (!agentName) return;
      await agentSkillAttachmentsService.setForAgent(agentName, skillNames);
      await refresh();
    },
    [agentName, refresh],
  );

  const attach = useCallback<UseAgentSkillAttachmentsResult['attach']>(
    async skillName => {
      if (!agentName) return;
      await agentSkillAttachmentsService.attach(agentName, skillName);
      await refresh();
    },
    [agentName, refresh],
  );

  const detach = useCallback<UseAgentSkillAttachmentsResult['detach']>(
    async skillName => {
      if (!agentName) return;
      await agentSkillAttachmentsService.detach(agentName, skillName);
      await refresh();
    },
    [agentName, refresh],
  );

  return { attached, loading, refresh, setAttached, attach, detach };
}
