'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ARGO_MAKE_AUTHOR_AGENT_NAME } from '@/lib/constants/argo-make';
import { getAuthorAgentPreflight } from '@/lib/services/author-agent-preflight';
import { useNamespace } from '@/providers/NamespaceProvider';

export interface AuthorAgentGate {
  gated: boolean;
  agentMissing: boolean;
  mcpMissing: boolean;
  loading: boolean;
  recheck: () => void;
}

export function useAuthorAgentGate(): AuthorAgentGate {
  const { namespace } = useNamespace();

  const [agentMissing, setAgentMissing] = useState<boolean>(true);
  const [mcpMissing, setMcpMissing] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [nonce, setNonce] = useState<number>(0);

  const tokenRef = useRef<number>(0);

  const recheck = useCallback(() => {
    setNonce(value => value + 1);
  }, []);

  useEffect(() => {
    const token = tokenRef.current + 1;
    tokenRef.current = token;
    let cancelled = false;

    setLoading(true);

    getAuthorAgentPreflight(ARGO_MAKE_AUTHOR_AGENT_NAME)
      .then(result => {
        if (cancelled || tokenRef.current !== token) {
          return;
        }
        setAgentMissing(!result.agentPresent || !result.agentReady);
        setMcpMissing(!result.mcpToolsOnAgent || !result.mcpToolCrdsPresent);
      })
      .catch(() => {
        if (cancelled || tokenRef.current !== token) {
          return;
        }
        setAgentMissing(true);
        setMcpMissing(true);
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
  }, [namespace, nonce]);

  return {
    gated: agentMissing || mcpMissing,
    agentMissing,
    mcpMissing,
    loading,
    recheck,
  };
}
