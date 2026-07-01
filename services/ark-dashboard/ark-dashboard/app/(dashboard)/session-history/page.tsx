'use client';

import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { SessionsTable } from '@/components/sessions-conversations/sessions-table';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

export default function SessionsConversationsPage() {
  const { push } = useNamespacedNavigation();

  return (
    <div className="flex h-full flex-col space-y-6 p-8">
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Sessions"
      />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Activity className="size-5" />
          <h1 className="text-2xl font-semibold">Sessions</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Monitor all sessions across agents, teams and tools
        </p>
      </div>

      <div className="flex-1">
        <SessionsTable
          onSelectSession={(sessionId) => push(`/sessions/${sessionId}`)}
          selectedSessionId={null}
        />
      </div>
    </div>
  );
}
