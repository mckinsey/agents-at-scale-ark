'use client';

import { useCallback, useMemo, useState } from 'react';

import {
  NameWorkflowDialog,
  type NameWorkflowValues,
} from '@/components/dialogs/name-workflow-dialog';
import { AccountTree } from '@/components/icons';
import {
  ResourceListCreateButton,
  ResourceListSection,
} from '@/components/sections/resource-list-section';
import { WorkflowTemplatesNotInstalled } from '@/components/sections/workflow-templates-not-installed';
import {
  type WorkflowTemplateListItem,
  WorkflowTemplatesTable,
} from '@/components/sections/workflow-templates-table';
import { toast } from '@/components/ui/sonner';
import { ARGO_WORKFLOWS_DOCS_URL } from '@/lib/constants/workflows';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { useWorkflowTemplateAccess } from '@/lib/hooks/use-workflow-template-access';
import {
  WORKFLOW_TEMPLATE_ANNOTATIONS,
  type WorkflowTemplate,
  isArgoNotInstalledError,
  workflowTemplatesService,
} from '@/lib/services/workflow-templates';
import {
  useDeleteWorkflowTemplate,
  useGetAllWorkflowTemplates,
} from '@/lib/services/workflow-templates-hooks';
import { countWorkflowTasks } from '@/lib/utils/workflow';
import { showWorkflowStartedToast } from '@/lib/utils/workflow-toast';
import { useNamespace } from '@/providers/NamespaceProvider';

function mapTemplateToItem(
  template: WorkflowTemplate,
): WorkflowTemplateListItem {
  const annotations = template.metadata.annotations || {};
  return {
    id: template.metadata.name,
    name: template.metadata.name,
    title: annotations[WORKFLOW_TEMPLATE_ANNOTATIONS.TITLE],
    description: annotations[WORKFLOW_TEMPLATE_ANNOTATIONS.DESCRIPTION],
    stages: countWorkflowTasks(template.spec),
    parameters: template.spec?.arguments?.parameters,
  };
}

export function WorkflowTemplatesSection() {
  const { namespace } = useNamespace();
  const { canCreate } = useWorkflowTemplateAccess();
  const { push } = useNamespacedNavigation();
  const [showNameDialog, setShowNameDialog] = useState(false);
  const {
    data: templates,
    isPending,
    error,
    refetch,
    dataUpdatedAt,
  } = useGetAllWorkflowTemplates();
  const deleteTemplate = useDeleteWorkflowTemplate();
  const items = useMemo(
    () => (templates ?? []).map(mapTemplateToItem),
    [templates],
  );

  const handleRun = useCallback(
    async (
      id: string,
      parameters?: Record<string, string>,
      workflowName?: string,
    ) => {
      try {
        const workflow = await workflowTemplatesService.run(
          namespace,
          id,
          parameters,
          workflowName,
        );
        showWorkflowStartedToast(workflow.metadata.name);
      } catch (error) {
        console.error('Failed to start workflow:', error);
        toast.error('Failed to start workflow', {
          description:
            error instanceof Error
              ? error.message
              : 'An unknown error occurred',
        });
        throw error;
      }
    },
    [namespace],
  );

  const handleConfirmName = ({
    name,
    title,
    description,
  }: NameWorkflowValues) => {
    setShowNameDialog(false);
    const titleParam = title ? `&title=${encodeURIComponent(title)}` : '';
    const descriptionParam = description
      ? `&description=${encodeURIComponent(description)}`
      : '';
    push(
      `/workflow-templates/new?name=${encodeURIComponent(name)}${titleParam}${descriptionParam}`,
    );
  };

  if (isArgoNotInstalledError(error)) {
    return <WorkflowTemplatesNotInstalled />;
  }

  return (
    <>
      <ResourceListSection
        icon={<AccountTree />}
        title="Workflow templates"
        showCount
        subtitle="Automate complex processes with agentic orchestration"
        createAction={
          canCreate ? (
            <ResourceListCreateButton
              label="Create workflow template"
              onClick={() => setShowNameDialog(true)}
              data-testid="workflow-create-template"
            />
          ) : null
        }
        showStatusFilter={false}
        learnMoreUrl={ARGO_WORKFLOWS_DOCS_URL}
        entityLabel="Workflow Template"
        entityPluralLabel="workflow templates"
        emptyTitle="No Workflow Templates Yet"
        emptyDescription={
          <>
            <p className="mb-2">
              You haven&apos;t created any workflow templates yet.
            </p>
            <p>Get started by creating your first workflow template.</p>
          </>
        }
        items={items}
        loading={isPending}
        error={error}
        dataUpdatedAt={dataUpdatedAt}
        onDelete={id => deleteTemplate.mutate(id)}
        onReload={() => refetch()}
        renderTable={(rows, onDelete) => (
          <WorkflowTemplatesTable
            templates={rows}
            onDelete={onDelete}
            onRun={handleRun}
          />
        )}
      />
      <NameWorkflowDialog
        open={showNameDialog}
        onOpenChange={setShowNameDialog}
        onConfirm={handleConfirmName}
      />
    </>
  );
}
