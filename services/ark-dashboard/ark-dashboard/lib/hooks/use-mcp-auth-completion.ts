'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { type MCPServer, mcpServersService } from '@/lib/services/mcp-servers';
import { GET_ALL_MCP_SERVERS_QUERY_KEY } from '@/lib/services/mcp-servers-hooks';

export const AUTH_POLL_INTERVAL_MS = 2000;
export const AUTH_POLL_BUDGET_MS = 30000;

// namespace is intentionally NOT stripped: it is the dashboard's scoping param
// and keeping it preserves the namespace across a refresh. The four auth params
// below are what trigger this handler, so removing them prevents re-triggering.
const CONSUMED_PARAMS = [
  'authorized',
  'auth_id',
  'auth_error',
  'auth_error_desc',
];

function stripAuthParams() {
  if (typeof window === 'undefined') {
    return;
  }
  const url = new URL(window.location.href);
  for (const key of CONSUMED_PARAMS) {
    url.searchParams.delete(key);
  }
  window.history.replaceState(null, '', url.toString());
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface UseMcpAuthCompletionArgs {
  servers?: MCPServer[];
}

// Confirms a dashboard-initiated MCP auth flow on return from the IdP, reading
// the callback redirect params and polling auth/status to a terminal state.
export function useMcpAuthCompletion({ servers }: UseMcpAuthCompletionArgs = {}) {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const processedRef = useRef(false);
  const serversRef = useRef<MCPServer[] | undefined>(servers);
  serversRef.current = servers;

  useEffect(() => {
    if (processedRef.current) {
      return;
    }

    const authError = searchParams.get('auth_error');
    const authorized = searchParams.get('authorized');
    const authId = searchParams.get('auth_id');
    const namespace = searchParams.get('namespace') ?? '';

    if (!authError && !(authorized && authId)) {
      return;
    }
    processedRef.current = true;

    if (authError) {
      if (authError === 'expired') {
        toast.error('Authentication flow expired', {
          description: 'The flow expired — please try again.',
        });
      } else {
        const description = searchParams.get('auth_error_desc') || authError;
        toast.error('Authentication Failed', { description });
      }
      stripAuthParams();
      return;
    }

    let cancelled = false;

    const poll = async () => {
      const deadline = Date.now() + AUTH_POLL_BUDGET_MS;
      while (!cancelled) {
        let state: string | undefined;
        let message: string | null | undefined;
        try {
          const status = await mcpServersService.getAuthStatus(authorized!, {
            authId: authId!,
            namespace,
          });
          state = status.state;
          message = status.message;
        } catch {
          state = undefined;
        }
        if (cancelled) {
          return;
        }

        if (state === 'authorized') {
          toast.success('Authentication Complete', {
            description: `Authorized ${authorized}`,
          });
          queryClient.invalidateQueries({
            queryKey: [GET_ALL_MCP_SERVERS_QUERY_KEY],
          });
          break;
        }
        if (state === 'failed') {
          toast.error('Authentication Failed', {
            description: message || 'The authorization flow failed.',
          });
          break;
        }
        if (state === 'expired') {
          const alreadyAuthorized =
            serversRef.current?.find(server => server.name === authorized)
              ?.authorization?.state === 'Authorized';
          if (!alreadyAuthorized) {
            toast.error('Authentication flow expired', {
              description: 'The flow expired — please try again.',
            });
          }
          break;
        }
        if (Date.now() >= deadline) {
          toast.warning('Authentication submitted', {
            description: 'Submitted — not yet confirmed; check the server status.',
          });
          break;
        }
        await delay(AUTH_POLL_INTERVAL_MS);
      }
      if (!cancelled) {
        stripAuthParams();
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [searchParams, queryClient]);
}
