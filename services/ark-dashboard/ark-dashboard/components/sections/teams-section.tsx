'use client';

import { Group } from '@/components/icons';
import { ResourceListSection } from '@/components/sections/resource-list-section';
import { TeamsTable } from '@/components/sections/teams-table';
import { teamsService } from '@/lib/services';

export function TeamsSection() {
  return (
    <ResourceListSection
      icon={<Group />}
      title="Teams"
      subtitle="Create and manage teams of agents"
      createHref="/teams/new"
      createLabel="Create Team"
      learnMoreUrl="https://mckinsey.github.io/agents-at-scale-ark/user-guide/teams/"
      entityLabel="Team"
      entityPluralLabel="teams"
      emptyTitle="No teams yet"
      emptyDescription={
        <>
          <p className="mb-2">You haven&apos;t created any teams yet.</p>
          <p>Get started by creating your first team.</p>
        </>
      }
      loadItems={() => teamsService.getAll()}
      deleteItem={id => teamsService.deleteById(id)}
      renderTable={(teams, onDelete) => (
        <TeamsTable teams={teams} onDelete={onDelete} />
      )}
    />
  );
}
