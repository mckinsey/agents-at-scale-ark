'use client';

import { ExternalLink, Play, Trash2, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { DeleteWorkflowTemplateDialog } from '@/components/dialogs/delete-workflow-template-dialog';
import { RunWorkflowDialog } from '@/components/dialogs/run-workflow-dialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { WorkflowParameter } from '@/lib/services/workflow-templates';
import { useNamespace } from '@/providers/NamespaceProvider';

const ARGO_BASE_URL =
  process.env.NEXT_PUBLIC_ARGO_URL || 'http://localhost:2746';

export interface Flow {
  id: string;
  title?: string;
  description?: string;
  stages: number;
  manifest?: string;
}

interface FlowRowProps {
  readonly flow: Flow;
  readonly parameters?: WorkflowParameter[];
  readonly readOnly?: boolean;
  readonly onRun?: (
    flowId: string,
    parameters?: Record<string, string>,
    workflowName?: string,
  ) => Promise<void>;
  readonly onDelete?: (flowId: string) => Promise<void>;
}

export function FlowRow({
  flow,
  parameters,
  readOnly,
  onRun,
  onDelete,
}: FlowRowProps) {
  const { namespace } = useNamespace();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleRunWorkflow = async (
    params?: Record<string, string>,
    workflowName?: string,
  ) => {
    if (onRun) {
      await onRun(flow.id, params, workflowName);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (onDelete) {
      await onDelete(flow.id);
    }
  };

  return (
    <div className="bg-card hover:bg-accent/5 relative flex w-full items-center gap-4 overflow-hidden rounded-md border px-4 py-3 transition-colors">
      <Link
        href={`/workflow-templates/${flow.id}`}
        className="absolute inset-0 z-0"
      />

      <div className="pointer-events-none relative z-10 flex flex-grow items-center gap-3 overflow-hidden">
        <div className="flex-shrink-0">
          <Workflow className="text-muted-foreground h-5 w-5 flex-shrink-0" />
        </div>

        <div className="flex max-w-[850px] min-w-0 flex-col gap-1">
          <p className="truncate text-sm font-medium" title={flow.id}>
            {flow.id}
          </p>
          {flow.title && (
            <p
              className="text-muted-foreground truncate text-xs font-medium"
              title={flow.title}>
              {flow.title}
            </p>
          )}
          {flow.description && (
            <p
              className="text-muted-foreground truncate text-xs"
              title={flow.description}>
              {flow.description}
            </p>
          )}
        </div>
      </div>

      <div className="relative z-10 flex flex-shrink-0 items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="pointer-events-auto h-8 w-8 cursor-pointer p-0"
                asChild>
                <a
                  href={`${ARGO_BASE_URL}/workflow-templates/${namespace}/${flow.id}`}
                  target="_blank"
                  rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in Argo</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {onDelete && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="pointer-events-auto h-8 w-8 cursor-pointer p-0"
                  disabled={readOnly}
                  onClick={handleDeleteClick}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {readOnly ? 'Delete disabled in demo mode' : 'Delete template'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {onRun && (
          <TooltipProvider>
            <Tooltip>
              <RunWorkflowDialog
                templateName={flow.id}
                parameters={parameters}
                onRun={handleRunWorkflow}
                trigger={
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="pointer-events-auto h-8 w-8 cursor-pointer p-0">
                      <Play className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                }
              />
              <TooltipContent>Run workflow</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <DeleteWorkflowTemplateDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        templateName={flow.id}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
