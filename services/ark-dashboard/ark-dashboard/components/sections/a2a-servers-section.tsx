'use client';

import { ArrowUpRightIcon, Plus } from 'lucide-react';
import type React from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { toast } from 'sonner';

import { A2AServerCard } from '@/components/cards';
import { InfoDialog } from '@/components/dialogs/info-dialog';
import { A2AEditor } from '@/components/editors/a2a-editor';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { useDelayedLoading } from '@/lib/hooks';
import { type A2AServer, A2AServersService } from '@/lib/services';
import type { A2AServerConfiguration } from '@/lib/services/a2a-servers';

interface A2AServersSectionProps {
  namespace: string;
}

export type A2AServersSectionHandle = {
  openAddEditor: () => void;
};

export const A2AServersSection = forwardRef<
  A2AServersSectionHandle,
  A2AServersSectionProps
>(function A2AServersSection({ namespace }, ref) {
  const [a2aServers, setA2AServers] = useState<A2AServer[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoading = useDelayedLoading(loading);
  const [selectedServer, setSelectedServer] = useState<A2AServer | null>(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [a2aEditorOpen, setA2aEditorOpen] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      openAddEditor: () => setA2aEditorOpen(true),
    }),
    [],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await A2AServersService.getAll();
      setA2AServers(data);
    } catch (error) {
      console.error('Failed to load A2A servers:', error);
      toast.error('Failed to Load A2A Servers', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleInfo = (server: A2AServer) => {
    setSelectedServer(server);
    setInfoDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const server = a2aServers.find(s => s.id === id);
      if (!server) {
        throw new Error('A2A Server not found');
      }
      await A2AServersService.delete(id);
      toast.success('A2A Server Deleted', {
        description: `Successfully deleted ${server.name}`,
      });
      await loadData();
    } catch (error) {
      toast.error('Failed to Delete A2A Server', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  };

  const handleSave = async (config: A2AServerConfiguration) => {
    try {
      await A2AServersService.create(config);
      toast.success('A2A Server Created', {
        description: `Successfully created ${config.name}`,
      });
      await loadData();
      setA2aEditorOpen(false);
    } catch (error) {
      toast.error('Failed to Create A2A Server', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  };

  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="py-8 text-center">Loading...</div>
      </div>
    );
  }

  if (a2aServers.length === 0 && !loading) {
    return (
      <>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DASHBOARD_SECTIONS.a2a.icon />
            </EmptyMedia>
            <EmptyTitle>No A2A Servers Yet</EmptyTitle>
            <EmptyDescription>
              You haven&apos;t added any A2A Servers yet. Get started by adding
              your first A2A Server.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setA2aEditorOpen(true)}>
              <Plus className="h-4 w-4" />
              Add A2A Server
            </Button>
          </EmptyContent>
          <Button
            variant="link"
            asChild
            className="text-muted-foreground"
            size="sm">
            <a
              href="https://mckinsey.github.io/agents-at-scale-ark/"
              target="_blank">
              Learn More <ArrowUpRightIcon />
            </a>
          </Button>
        </Empty>
        <A2AEditor
          open={a2aEditorOpen}
          onOpenChange={setA2aEditorOpen}
          namespace={namespace}
          onSave={handleSave}
        />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-auto p-6">
        <div className="grid gap-6 pb-6 md:grid-cols-2 lg:grid-cols-3">
          {a2aServers.map(server => (
            <A2AServerCard
              key={server.name || server.id}
              a2aServer={server}
              onInfo={handleInfo}
              onDelete={handleDelete}
              namespace={namespace}
            />
          ))}
        </div>
      </main>

      {selectedServer && (
        <InfoDialog
          open={infoDialogOpen}
          onOpenChange={setInfoDialogOpen}
          title={`A2A Server: ${selectedServer.name || 'Unnamed'}`}
          data={selectedServer}
        />
      )}

      <A2AEditor
        open={a2aEditorOpen}
        onOpenChange={setA2aEditorOpen}
        namespace={namespace}
        onSave={handleSave}
      />
    </div>
  );
});
