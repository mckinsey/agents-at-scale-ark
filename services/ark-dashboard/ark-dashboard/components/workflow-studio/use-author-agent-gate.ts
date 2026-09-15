'use client';

import { useEffect, useRef, useState } from 'react';

import { ARGO_MAKE_AUTHOR_AGENT_NAME } from '@/lib/constants/argo-make';
import { getAuthorAgentPreflight } from '@/lib/services/author-agent-preflight';
import { useNamespace } from '@/providers/NamespaceProvider';

export interface AuthorAgentGate {
  gated: boolean;
  agentMissing: boolean;
  agentNotReady: boolean;
  mcpMissing: boolean;
  mcpNotReady: boolean;
  unverifiable: boolean;
  loading: boolean;
}

export function useAuthorAgentGate(): AuthorAgentGate {
  const { namespace } = useNamespace();

  const [agentMissing, setAgentMissing] = useState<boolean>(true);
  const [agentNotReady, setAgentNotReady] = useState<boolean>(false);
  const [mcpMissing, setMcpMissing] = useState<boolean>(true);
  const [mcpNotReady, setMcpNotReady] = useState<boolean>(false);
  const [unverifiable, setUnverifiable] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const tokenRef = useRef<number>(0);

  useEffect(() => {
    const token = tokenRef.current + 1;
    tokenRef.current = token;
    let cancelled = false;

    setLoading(true);

    getAuthorAgentPreflight(namespace, ARGO_MAKE_AUTHOR_AGENT_NAME)
      .then(result => {
        if (cancelled || tokenRef.current !== token) {
          return;
        }
        setAgentMissing(!result.agentPresent);
        setAgentNotReady(result.agentPresent && !result.agentReady);
        setMcpMissing(!result.mcpServerPresent);
        setMcpNotReady(result.mcpServerPresent && !result.mcpServerReady);
        setUnverifiable(result.unverifiable);
      })
      .catch(() => {
        if (cancelled || tokenRef.current !== token) {
          return;
        }
        setAgentMissing(true);
        setAgentNotReady(false);
        setMcpMissing(true);
        setMcpNotReady(false);
        setUnverifiable(false);
      })
      .finally(() => {
        if (cancelled || tokenRef.current !== token) {
          return;
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [namespace]);

  return {
    gated:
      unverifiable ||
      agentMissing ||
      agentNotReady ||
      mcpMissing ||
      mcpNotReady,
    agentMissing,
    agentNotReady,
    mcpMissing,
    mcpNotReady,
    unverifiable,
    loading,
  };
}
