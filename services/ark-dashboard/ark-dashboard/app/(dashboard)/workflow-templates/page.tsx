'use client';

import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';

import { PageHeader } from '@/components/common/page-header';
import {
  NameWorkflowDialog,
  type NameWorkflowValues,
} from '@/components/dialogs/name-workflow-dialog';
import {
  WorkflowTemplatesSection,
  type WorkflowTemplatesSectionHandle,
} from '@/components/sections/workflow-templates-section';
import { Button } from '@/components/ui/button';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { useWorkflowTemplateAccess } from '@/lib/hooks/use-workflow-template-access';
import { useNamespace } from '@/providers/NamespaceProvider';

export default function WorkflowTemplatesPage() {
  const { push } = useNamespacedNavigation();
  const { readOnlyMode } = useNamespace();
  const { canCreate } = useWorkflowTemplateAccess();
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [argoInstalled, setArgoInstalled] = useState(true);
  const sectionRef = useRef<WorkflowTemplatesSectionHandle>(null);

  const showCreate = canCreate && !readOnlyMode && argoInstalled;

  const handleConfirmName = ({
    name,
    title,
    description,
  }: NameWorkflowValues) => {
    setShowNameDialog(false);
    push(
      `/workflow-templates/new?name=${encodeURIComponent(name)}${title ? `&title=${encodeURIComponent(title)}` : ''}${description ? `&description=${encodeURIComponent(description)}` : ''}`,
    );
  };

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Workflow Templates"
        actions={
          <div className="flex items-center gap-2">
            {!readOnlyMode && argoInstalled && (
              <Button
                variant="outline"
                data-testid="workflow-add-group"
                onClick={() => sectionRef.current?.openCreateGroup()}>
                <Plus className="h-4 w-4" />
                Add group
              </Button>
            )}
            {showCreate && (
              <Button onClick={() => setShowNameDialog(true)}>
                <Plus className="h-4 w-4" />
                Create workflow template
              </Button>
            )}
          </div>
        }
      />
      <div className="flex flex-1 flex-col">
        <div className="">
          <h1 className="text-xl">Workflow Templates</h1>
          <p className="text-muted-foreground text-sm">
            Automate complex processes with agentic orchestration
          </p>
        </div>
        <WorkflowTemplatesSection
          ref={sectionRef}
          onArgoInstalledChange={setArgoInstalled}
        />
      </div>
      <NameWorkflowDialog
        open={showNameDialog}
        onOpenChange={setShowNameDialog}
        onConfirm={handleConfirmName}
      />
    </>
  );
}
