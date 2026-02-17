'use client';

import { PageHeader } from '@/components/common/page-header';
import { SessionsSection } from '@/components/sections/sessions-section';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { mapArgoWorkflowsToSessions } from '@/lib/services/workflow-mapper';
import { useWorkflows } from '@/lib/services/workflows-hooks';

export default function SessionsPage() {
  const { workflows } = useWorkflows('default');

  const allSessions = mapArgoWorkflowsToSessions(workflows);

  const pageTitle = allSessions
    ? `Workflow Runs (${allSessions.length})`
    : 'Workflow Runs';

  return (
    <>
      <PageHeader breadcrumbs={BASE_BREADCRUMBS} currentPage="Workflow Runs" />
      <div className="flex flex-1 flex-col">
        <div>
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <SessionsSection />
      </div>
    </>
  );
}
