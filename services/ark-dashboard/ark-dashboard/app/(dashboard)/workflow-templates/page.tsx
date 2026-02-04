'use client';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { WorkflowTemplatesSection } from '@/components/sections/workflow-templates-section';
import { useGetAllWorkflowTemplates } from '@/lib/services/workflow-templates-hooks';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function WorkflowTemplatesPage() {
  const { data: workflows } = useGetAllWorkflowTemplates();

  const pageTitle = workflows
    ? `Workflow Templates (${workflows.length})`
    : 'Workflow Templates';

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Workflow Templates" />
      <div className="flex flex-1 flex-col">
        <div className="px-6 pt-6">
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <WorkflowTemplatesSection />
      </div>
    </>
  );
}
