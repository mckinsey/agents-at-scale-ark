'use client';

import { useEffect, useState } from 'react';

import { type Flow, FlowRow } from '@/components/rows/flow-row';
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

function mapWorkflowTemplateToFlow(template: WorkflowTemplate): Flow {
  const annotations = template.metadata.annotations || {};
  return {
    id: template.metadata.name,
    title: annotations['workflows.argoproj.io/title'],
    description: annotations['workflows.argoproj.io/description'],
    stages: 0,
  };
}

export function WorkflowTemplatesSection() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoading = useDelayedLoading(loading);

  useEffect(() => {
    async function fetchFlows() {
      try {
        setLoading(true);
        const templates = await workflowTemplatesService.list();
        const mappedFlows = templates.map(mapWorkflowTemplateToFlow);
        setFlows(mappedFlows);
      } catch (error) {
        console.error('Failed to fetch workflow templates:', error);
        setFlows([]);
      } finally {
        setLoading(false);
      }
    }

    fetchFlows();
  }, []);

  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="py-8 text-center">Loading...</div>
      </div>
    );
  }

  if (flows.length === 0 && !loading) {
    const WorkflowIcon = DASHBOARD_SECTIONS['workflow-templates'].icon;
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WorkflowIcon />
          </EmptyMedia>
          <EmptyTitle>No Workflow Templates Yet</EmptyTitle>
          <EmptyDescription>
            You haven&apos;t created any workflow templates yet. Get started by
            creating your first workflow template.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent></EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-auto px-6 py-6">
        <div className="flex flex-col gap-3">
          {flows.map(flow => (
            <FlowRow key={flow.id} flow={flow} />
          ))}
        </div>
      </main>
    </div>
  );
}
