'use client';

import { AgentsApiAccess } from '@/components/dialogs/agents-api-access';
import { SmartToy } from '@/components/icons';
import { AgentsTable } from '@/components/sections/agents-table';
import { ResourceListSection } from '@/components/sections/resource-list-section';
import { agentsService } from '@/lib/services';

export function AgentsSection() {
  return (
    <ResourceListSection
      icon={<SmartToy />}
      title="Agents"
      subtitle="Create and manage agents to automate tasks"
      createHref="/agents/new"
      createLabel="Create Agent"
      learnMoreUrl="https://mckinsey.github.io/agents-at-scale-ark/user-guide/agents/"
      entityLabel="Agent"
      entityPluralLabel="agents"
      emptyTitle="No agents yet"
      emptyDescription={
        <>
          <p className="mb-2">You haven&apos;t created any agents yet.</p>
          <p>Get started by creating your first agent.</p>
        </>
      }
      headerActions={<AgentsApiAccess />}
      loadItems={() => agentsService.getAll()}
      deleteItem={id => agentsService.deleteById(id)}
      renderTable={(agents, onDelete) => (
        <AgentsTable agents={agents} onDelete={onDelete} />
      )}
    />
  );
}
