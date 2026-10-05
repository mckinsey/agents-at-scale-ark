'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ResourcePageHeader } from '@/components/common/resource-page-header';
import { A2AEditor } from '@/components/editors/a2a-editor';
import { Dns } from '@/components/icons';
import { A2AServersTable } from '@/components/sections/a2a-servers-table';
import {
  LearnMoreButton,
  ResourceEmptyState,
  ResourceErrorState,
} from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { DOCS_URLS } from '@/lib/constants/docs';
import { useDelayedLoading } from '@/lib/hooks';
import type { A2AServerConfiguration } from '@/lib/services/a2a-servers';
import {
  useCreateA2AServer,
  useDeleteA2AServer,
  useListA2AServers,
} from '@/lib/services/a2a-servers-hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

const errorDescription = (error: unknown) =>
  error instanceof Error ? error.message : 'An unexpected error occurred';

export function A2AServersSection() {
  const { namespace, readOnlyMode } = useNamespace();
  const [a2aEditorOpen, setA2aEditorOpen] = useState(false);

  const {
    data: a2aServers = [],
    isLoading,
    error,
    dataUpdatedAt,
  } = useListA2AServers();
  const showLoading = useDelayedLoading(isLoading);

  const createServer = useCreateA2AServer();
  const deleteServer = useDeleteA2AServer();

  useEffect(() => {
    if (!error) return;
    console.error('Failed to load A2A servers:', error);
  }, [error]);

  const openAddEditor = useCallback(() => setA2aEditorOpen(true), []);

  const handleDelete = async (id: string) => {
    const server = a2aServers.find(s => s.id === id);
    try {
      await deleteServer.mutateAsync(id);
      toast.success('A2A Server Deleted', {
        description: `Successfully deleted ${server?.name ?? id}`,
      });
    } catch (err) {
      toast.error('Failed to Delete A2A Server', {
        description: errorDescription(err),
      });
    }
  };

  const handleSave = async (config: A2AServerConfiguration) => {
    try {
      await createServer.mutateAsync(config);
      toast.success('A2A Server Created', {
        description: `Successfully created ${config.name}`,
      });
      setA2aEditorOpen(false);
    } catch (err) {
      toast.error('Failed to Create A2A Server', {
        description: errorDescription(err),
      });
    }
  };

  const hasServers = a2aServers.length > 0;
  const hasError = Boolean(error);
  const hasLoadedOnce = dataUpdatedAt > 0;
  const loadFailed = hasError && !hasLoadedOnce;
  const refreshFailed = hasError && hasLoadedOnce;
  const isEmpty = !isLoading && !loadFailed && !hasServers;
  const showHeaderAction = !isLoading && !isEmpty;

  return (
    <div className="content-shell flex h-full w-full flex-col">
      <ResourcePageHeader
        icon={<Dns className="size-full" />}
        title="A2A servers"
        description="Register servers that host agents via the A2A protocol"
        actions={
          showHeaderAction ? (
            <Button onClick={openAddEditor} disabled={readOnlyMode}>
              Create A2A server
            </Button>
          ) : undefined
        }
      />

      {showLoading && (
        <div className="mt-5 flex flex-1 items-center justify-center">
          <div className="py-8 text-center">Loading...</div>
        </div>
      )}

      {!showLoading && loadFailed && (
        <ResourceErrorState
          className="mt-5"
          title="Couldn't load A2A servers"
          description={errorDescription(error)}
        />
      )}

      {!showLoading && refreshFailed && (
        <ResourceErrorState
          className="mt-5"
          title="Couldn't refresh A2A servers"
          description="Showing the last loaded version."
        />
      )}

      {!showLoading && isEmpty && (
        <ResourceEmptyState
          icon={<Dns className="size-full" />}
          title="No A2A server yet"
          description={
            <>
              <p className="mb-2">You haven&apos;t added any A2A server yet.</p>
              <p>Get started to see servers.</p>
            </>
          }
          actions={
            <>
              <LearnMoreButton href={DOCS_URLS.a2aServers} />
              <Button onClick={openAddEditor} disabled={readOnlyMode}>
                Create
              </Button>
            </>
          }
        />
      )}

      {!showLoading && hasServers && (
        <div className="mt-5 min-h-0 flex-1 overflow-auto">
          <A2AServersTable servers={a2aServers} onDelete={handleDelete} />
        </div>
      )}

      <A2AEditor
        open={a2aEditorOpen}
        onOpenChange={setA2aEditorOpen}
        namespace={namespace}
        onSave={handleSave}
      />
    </div>
  );
}
