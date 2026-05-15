'use client';

import { Earthquake } from '@/components/icons';
import { SessionsTable } from '@/components/sessions-conversations/sessions-table';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

export default function SessionsConversationsPage() {
  const { push } = useNamespacedNavigation();

  return (
    <div className="-m-10 flex h-full flex-col gap-5 px-12 py-10">
      <div className="flex flex-col gap-1" data-testid="page-header">
        <div className="flex items-center gap-1">
          <Earthquake className="size-5" />
          <h1 className="text-2xl font-normal text-fg-primary">Sessions</h1>
        </div>
        <p className="text-sm text-fg-secondary">
          Monitor all sessions across agents, teams and tools
        </p>
      </div>

      <SessionsTable
        onSelectSession={(sessionId) => push(`/sessions/${sessionId}`)}
        selectedSessionId={null}
      />
    </div>
  );
}
