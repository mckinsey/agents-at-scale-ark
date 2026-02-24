'use client';

import { PageHeader } from '@/components/common/page-header';
import { WorkflowTemplatesSection } from '@/components/sections/workflow-templates-section';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useGetAllWorkflowTemplates } from '@/lib/services/workflow-templates-hooks';

export default function WorkflowTemplatesPage() {
  const { data: workflows } = useGetAllWorkflowTemplates();

  const pageTitle = workflows
    ? `Workflow Templates (${workflows.length})`
    : 'Workflow Templates';

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Workflow Templates"
      />
      <div className="flex flex-1 flex-col">
        <div className="">
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <WorkflowTemplatesSection />
      </div>
    </>
  );
}
