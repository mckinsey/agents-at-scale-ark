'use client';

import { ResourcePageHeader } from '@/components/common/resource-page-header';
import { Terminal } from '@/components/icons';
import {
  LearnMoreButton,
  ResourceEmptyState,
  ResourceErrorState,
} from '@/components/sections/resource-list-states';
import { SessionsSection } from '@/components/sections/sessions-section';
import { ARGO_WORKFLOWS_DOCS_URL } from '@/lib/constants/workflows';
import { mapArgoWorkflowsToSessions } from '@/lib/services/workflow-mapper';
import { useWorkflows } from '@/lib/services/workflows-hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

export default function WorkflowRunsPage() {
  const { namespace } = useNamespace();
  const { workflows, loading, error } = useWorkflows(namespace);

  const allSessions = mapArgoWorkflowsToSessions(workflows);
  const isEmpty = !loading && !error && allSessions.length === 0;

  const pageTitle = allSessions.length
    ? `Workflow runs (${allSessions.length})`
    : 'Workflow runs';

  return (
    <div className="content-shell flex min-h-0 w-full flex-1 flex-col">
      <ResourcePageHeader
        icon={<Terminal />}
        title={pageTitle}
        description="Track workflow execution across agents, tools, and tasks"
      />

      {error ? (
        <ResourceErrorState
          className="mt-5"
          title="Couldn't load workflow runs"
          description={error.message}
        />
      ) : isEmpty ? (
        <ResourceEmptyState
          icon={<Terminal className="size-full" />}
          title="No workflow runs yet"
          description={
            <>
              <p className="mb-2">You haven&apos;t created any sessions yet.</p>
              <p>Get started by creating your session to see workflow runs.</p>
            </>
          }
          actions={<LearnMoreButton href={ARGO_WORKFLOWS_DOCS_URL} />}
        />
      ) : (
        <SessionsSection />
      )}
    </div>
  );
}
