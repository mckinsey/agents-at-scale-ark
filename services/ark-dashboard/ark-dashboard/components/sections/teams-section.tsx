'use client';

import { Group } from '@/components/icons';
import { ResourceListSection } from '@/components/sections/resource-list-section';
import { TeamsTable } from '@/components/sections/teams-table';
import { DOCS_URLS } from '@/lib/constants/docs';
import { teamsService } from '@/lib/services';
import { useNamespace } from '@/providers/NamespaceProvider';

export function TeamsSection() {
  const { namespace } = useNamespace();
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
      loadItems={() => teamsService.getAll(namespace)}
      deleteItem={id => teamsService.deleteById(namespace, id)}
      renderTable={(teams, onDelete) => (
        <TeamsTable teams={teams} onDelete={onDelete} />
      )}
    />
  );
}
