'use client';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { SessionsSection } from '@/components/sections/sessions-section';
import { mapArgoWorkflowsToSessions } from '@/lib/services/workflow-mapper';
import { useWorkflows } from '@/lib/services/workflows-hooks';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function SessionsPage() {
  const { workflows } = useWorkflows('default');

  const allSessions = mapArgoWorkflowsToSessions(workflows);

  const pageTitle = allSessions
    ? `Workflow Runs (${allSessions.length})`
    : 'Workflow Runs';

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Workflow Runs" />
      <div className="flex flex-1 flex-col">
        <div>
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <SessionsSection />
      </div>
    </>
  );
}
