'use client';

import { useState } from 'react';

import { Add, Earthquake } from '@/components/icons';
import { NewSessionDialog } from '@/components/sessions-conversations/new-session-dialog';
import { SessionsTable } from '@/components/sessions-conversations/sessions-table';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

export default function SessionsConversationsPage() {
  const { push } = useNamespacedNavigation();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex h-full w-full mx-auto max-w-[1600px] flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1" data-testid="page-header">
          <div className="flex items-center gap-1">
            <Earthquake className="size-5" />
            <h1 className="text-2xl font-normal text-fg-primary">Sessions</h1>
          </div>
          <p className="text-sm text-fg-secondary">
            Monitor all sessions across agents, teams and tools
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="h-9">
          <IconShell size="sm">
            <Add />
          </IconShell>
          New session
        </Button>
      </div>

      <SessionsTable
        onSelectSession={(sessionId) => push(`/sessions/${sessionId}`)}
        selectedSessionId={null}
      />

      <NewSessionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
