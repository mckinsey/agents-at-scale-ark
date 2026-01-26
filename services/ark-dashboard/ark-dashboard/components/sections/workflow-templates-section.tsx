'use client';

import { ArrowUpRightIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { type Flow, FlowRow } from '@/components/rows/flow-row';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { useDelayedLoading } from '@/lib/hooks';
import {
  type WorkflowTemplate,
  workflowTemplatesService,
} from '@/lib/services/workflow-templates';
import { countWorkflowTasks } from '@/lib/utils/workflow';
import { showWorkflowStartedToast } from '@/lib/utils/workflow-toast';

function mapWorkflowTemplateToFlow(template: WorkflowTemplate): Flow {
  const annotations = template.metadata.annotations || {};
  const stages = countWorkflowTasks(template.spec);
  return {
    id: template.metadata.name,
    title: annotations['workflows.argoproj.io/title'],
    description: annotations['workflows.argoproj.io/description'],
    stages,
  };
}

export function WorkflowTemplatesSection() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoading = useDelayedLoading(loading);

  const fetchFlows = async () => {
    try {
      setLoading(true);
      const fetchedTemplates = await workflowTemplatesService.list();
      setTemplates(fetchedTemplates);
    } catch (error) {
      console.error('Failed to fetch workflow templates:', error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlows();
  }, []);

  const handleRunWorkflow = async (
    flowId: string,
    parameters?: Record<string, string>,
    workflowName?: string,
  ) => {
    try {
      const workflow = await workflowTemplatesService.run(
        flowId,
        parameters,
        workflowName,
      );
      showWorkflowStartedToast(workflow.metadata.name);
    } catch (error) {
      console.error('Failed to start workflow:', error);
      toast.error('Failed to start workflow', {
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
      });
      throw error;
    }
  };

  const handleDeleteWorkflow = async (flowId: string) => {
    try {
      await workflowTemplatesService.delete(flowId);
      toast.success('Workflow template deleted', {
        description: `Deleted workflow template: ${flowId}`,
      });
      await fetchFlows();
    } catch (error) {
      console.error('Failed to delete workflow template:', error);
      toast.error('Failed to delete workflow template', {
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
      });
    }
  };

  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="py-8 text-center">Loading...</div>
      </div>
    );
  }

  if (templates.length === 0 && !loading) {
    const WorkflowIcon = DASHBOARD_SECTIONS['workflow-templates'].icon;
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WorkflowIcon />
          </EmptyMedia>
          <EmptyTitle>No Workflow Templates Yet</EmptyTitle>
          <EmptyDescription>
            You haven&apos;t created any workflow templates yet. Argo Workflows
            must be installed as a prerequisite. Get started by creating your
            first workflow template.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent></EmptyContent>
        <Button
          variant="link"
          asChild
          className="text-muted-foreground"
          size="sm">
          <a
            href="https://mckinsey.github.io/agents-at-scale-ark/developer-guide/workflows/"
            target="_blank">
            Learn how to create Workflow Templates <ArrowUpRightIcon />
          </a>
        </Button>
      </Empty>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-auto px-6 py-6">
        <div className="flex flex-col gap-3">
          {templates.map(template => {
            const flow = mapWorkflowTemplateToFlow(template);
            return (
              <FlowRow
                key={flow.id}
                flow={flow}
                parameters={template.spec?.arguments?.parameters}
                onRun={handleRunWorkflow}
                onDelete={handleDeleteWorkflow}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}
