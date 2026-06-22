'use client';

import { Plus } from 'lucide-react';

import { PageHeader } from '@/components/common/page-header';
import { WorkflowTemplatesSection } from '@/components/sections/workflow-templates-section';
import { Button } from '@/components/ui/button';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { useGetAllWorkflowTemplates } from '@/lib/services/workflow-templates-hooks';

export default function WorkflowTemplatesPage() {
  const { data: workflows } = useGetAllWorkflowTemplates();
  const { push } = useNamespacedNavigation();

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
        <div className="flex items-center justify-between">
          <h1 className="text-xl">{pageTitle}</h1>
          <Button size="sm" onClick={() => push('/workflow-templates/new')}>
            <Plus className="mr-1 h-4 w-4" />
            New
          </Button>
        </div>
        <WorkflowTemplatesSection />
      </div>
    </>
  );
}
