'use client';

import { AgentsApiAccess } from '@/components/dialogs/agents-api-access';
import { SmartToy } from '@/components/icons';
import { AgentsTable } from '@/components/sections/agents-table';
import { ResourceListSection } from '@/components/sections/resource-list-section';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import { DOCS_URLS } from '@/lib/constants/docs';
import { agentsService } from '@/lib/services';
import { useNamespace } from '@/providers/NamespaceProvider';
import { getOriginLabel } from '@/lib/utils/origin-icon';

export function AgentsSection() {
  const { namespace } = useNamespace();
  return (
    <ResourceListSection
      icon={<SmartToy />}
      title="Agents"
      subtitle="Create and manage agents to automate tasks"
      createHref="/agents/new"
      createLabel="Create agent"
      learnMoreUrl={DOCS_URLS.agents}
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
      originFilter={{
        label: 'Origin',
        getValue: agent =>
          getOriginLabel(agent.annotations?.[ARK_ANNOTATIONS.ORIGIN]),
      }}
      loadItems={() => agentsService.getAll(namespace)}
      deleteItem={id => agentsService.deleteById(namespace, id)}
      renderTable={(agents, onDelete) => (
        <AgentsTable agents={agents} onDelete={onDelete} />
      )}
    />
  );
}
