'use client';

import { Group } from '@/components/icons';
import { ResourceListSection } from '@/components/sections/resource-list-section';
import { TeamsTable } from '@/components/sections/teams-table';
import { DOCS_URLS } from '@/lib/constants/docs';
import { useDeleteTeam, useGetAllTeams } from '@/lib/services/teams-hooks';

export function TeamsSection() {
  const { data: teams = [], isPending, error, refetch } = useGetAllTeams();
  const deleteTeam = useDeleteTeam();

  return (
    <ResourceListSection
      icon={<Group />}
      title="Teams"
      subtitle="Create and manage teams of agents"
      createHref="/teams/new"
      createLabel="Create team"
      learnMoreUrl={DOCS_URLS.teams}
      entityLabel="Team"
      entityPluralLabel="teams"
      emptyTitle="No teams yet"
      emptyDescription={
        <>
          <p className="mb-2">You haven&apos;t created any teams yet.</p>
          <p>Get started by creating your first team.</p>
        </>
      }
      items={teams}
      loading={isPending}
      error={error}
      onDelete={id => deleteTeam.mutate(id)}
      onReload={() => refetch()}
      renderTable={(items, onDelete) => (
        <TeamsTable teams={items} onDelete={onDelete} />
      )}
    />
  );
}
