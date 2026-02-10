'use client';

import { Plus } from 'lucide-react';
import { useRef } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { TeamsSection } from '@/components/sections/teams-section';
import { Button } from '@/components/ui/button';
import { useNamespace } from '@/providers/NamespaceProvider';
import { useGetAllTeams } from '@/lib/services/teams-hooks';

export default function TeamsPage() {
  const teamsSectionRef = useRef<{ openAddEditor: () => void }>(null);
  const { readOnlyMode } = useNamespace();
  const { data: teams } = useGetAllTeams();

  const pageTitle = teams ? `Teams (${teams.length})` : 'Teams';

  return (
    <>
      <PageHeader
        actions={
          <Button
            onClick={() => teamsSectionRef.current?.openAddEditor()}
            disabled={readOnlyMode}>
            <Plus className="h-4 w-4" />
            Create Team
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <div>
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <TeamsSection ref={teamsSectionRef} />
      </div>
    </>
  );
}
