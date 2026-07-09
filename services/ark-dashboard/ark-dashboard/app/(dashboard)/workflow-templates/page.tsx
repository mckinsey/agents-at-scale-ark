'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { NameWorkflowDialog } from '@/components/dialogs/name-workflow-dialog';
import { WorkflowTemplatesSection } from '@/components/sections/workflow-templates-section';
import { Button } from '@/components/ui/button';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { useWorkflowTemplateAccess } from '@/lib/hooks/use-workflow-template-access';
import { useGetAllWorkflowTemplates } from '@/lib/services/workflow-templates-hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

export default function WorkflowTemplatesPage() {
  const { data: workflows } = useGetAllWorkflowTemplates();
  const { push } = useNamespacedNavigation();
  const { readOnlyMode } = useNamespace();
  const { canCreate } = useWorkflowTemplateAccess();
  const [showNameDialog, setShowNameDialog] = useState(false);

  const pageTitle = workflows
    ? `Workflow Templates (${workflows.length})`
    : 'Workflow Templates';

  const showCreate = canCreate && !readOnlyMode;

  const handleConfirmName = (name: string) => {
    setShowNameDialog(false);
    push(`/workflow-templates/new?name=${encodeURIComponent(name)}`);
  };

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Workflow Templates"
        actions={
          showCreate ? (
            <Button onClick={() => setShowNameDialog(true)}>
              <Plus className="h-4 w-4" />
              Create workflow
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-1 flex-col">
        <div className="">
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <WorkflowTemplatesSection />
      </div>
      <NameWorkflowDialog
        open={showNameDialog}
        onOpenChange={setShowNameDialog}
        onConfirm={handleConfirmName}
      />
    </>
  );
}
