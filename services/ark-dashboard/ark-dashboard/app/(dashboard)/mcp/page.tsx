'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/common/page-header';
import { McpServersSection } from '@/components/sections/mcp-servers-section';
import { Button } from '@/components/ui/button';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { mcpServersService } from '@/lib/services/mcp-servers';
import {
  GET_ALL_MCP_SERVERS_QUERY_KEY,
  useGetAllMcpServers,
} from '@/lib/services/mcp-servers-hooks';

const AUTH_STATUS_POLL_INTERVAL_MS = 2000;
const AUTH_STATUS_POLL_TIMEOUT_MS = 60000;
const AUTH_QUERY_PARAMS = [
  'authorized',
  'auth_id',
  'auth_error',
  'auth_error_desc',
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

function stripAuthParams() {
  const url = new URL(window.location.href);
  AUTH_QUERY_PARAMS.forEach(key => url.searchParams.delete(key));
  window.history.replaceState(null, '', url.toString());
}

export default function McpPage() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get('namespace') || 'default';
  const mcpSectionRef = useRef<{
    openAddEditor: () => void;
    reload: () => void;
  }>(null);
  const queryClient = useQueryClient();
  const processedRef = useRef<string | null>(null);
  const { data: mcpServers } = useGetAllMcpServers();

  // Handle the post-callback redirect from ark-api's auth/callback. On success
  // we poll auth/status until terminal; on error we toast immediately. In all
  // cases the consumed auth params are stripped so a refresh does not re-run.
  useEffect(() => {
    const authorized = searchParams.get('authorized');
    const authId = searchParams.get('auth_id');
    const authError = searchParams.get('auth_error');
    const authErrorDesc = searchParams.get('auth_error_desc');

    if (!authError && !(authorized && authId)) return;

    const signature = `${authorized}|${authId}|${authError}|${authErrorDesc}`;
    if (processedRef.current === signature) return;
    processedRef.current = signature;

    if (authError) {
      if (authError === 'expired') {
        toast.error('Authorization flow expired', {
          description: 'The flow expired — please try again.',
        });
      } else {
        toast.error('Authentication failed', {
          description: authErrorDesc || authError,
        });
      }
      stripAuthParams();
      return;
    }

    let cancelled = false;
    const deadline = Date.now() + AUTH_STATUS_POLL_TIMEOUT_MS;

    const poll = async () => {
      try {
        const status = await mcpServersService.getAuthStatus(authorized as string, {
          namespace,
          authId: authId as string,
        });
        if (cancelled) return;

        if (status.state === 'authorized') {
          toast.success('Authentication complete', {
            description: `${authorized} is now authorized.`,
          });
          queryClient.invalidateQueries({
            queryKey: [GET_ALL_MCP_SERVERS_QUERY_KEY],
          });
          mcpSectionRef.current?.reload();
          stripAuthParams();
          return;
        }
        if (status.state === 'failed') {
          toast.error('Authentication failed', {
            description: status.message || 'The authorization failed.',
          });
          stripAuthParams();
          return;
        }
        if (status.state === 'expired') {
          toast.error('Authorization flow expired', {
            description: 'The flow expired — please try again.',
          });
          stripAuthParams();
          return;
        }

        if (Date.now() >= deadline) {
          toast.message('Authentication submitted', {
            description:
              'Submitted — not yet confirmed; check the server status.',
          });
          stripAuthParams();
          return;
        }
        setTimeout(poll, AUTH_STATUS_POLL_INTERVAL_MS);
      } catch (error) {
        if (cancelled) return;
        toast.error('Authentication failed', {
          description: getErrorMessage(error),
        });
        stripAuthParams();
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [searchParams, namespace, queryClient]);

  const pageTitle = mcpServers
    ? `MCP Servers (${mcpServers.length})`
    : 'MCP Servers';

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="MCP Servers"
        actions={
          <Button onClick={() => mcpSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Add MCP Server
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <div>
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <McpServersSection ref={mcpSectionRef} namespace={namespace} />
      </div>
    </>
  );
}
