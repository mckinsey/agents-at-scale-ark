'use client';

import { ExternalLink, Eye, Play, Trash2, Workflow } from 'lucide-react';
import Link from 'next/link';

import { RunWorkflowDialog } from '@/components/dialogs/run-workflow-dialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { WorkflowParameter } from '@/lib/services/workflow-templates';

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
  readonly onRun?: (
    flowId: string,
    parameters?: Record<string, string>,
  ) => Promise<void>;
  readonly onDelete?: (flowId: string) => Promise<void>;
}

export function FlowRow({ flow, parameters, onRun, onDelete }: FlowRowProps) {
  const handleRunWorkflow = async (params?: Record<string, string>) => {
    if (onRun) {
      await onRun(flow.id, params);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Are you sure you want to delete workflow template "${flow.id}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    if (onDelete) {
      await onDelete(flow.id);
    }
  };

  return (
    <div className="bg-card hover:bg-accent/5 flex w-full items-center gap-4 overflow-hidden rounded-md border px-4 py-3 transition-colors">
      <div className="flex flex-grow items-center gap-3 overflow-hidden">
        <div className="flex-shrink-0">
          <Workflow className="text-muted-foreground h-5 w-5 flex-shrink-0" />
        </div>

        <div className="flex max-w-[400px] min-w-0 flex-col gap-1">
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

      <div className="flex flex-shrink-0 items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 cursor-pointer p-0"
                asChild>
                <Link href={`/workflow-templates/${flow.id}`}>
                  <Eye className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>View template</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 cursor-pointer p-0"
                asChild>
                <a
                  href={`http://argo.127.0.0.1.nip.io:8080/workflow-templates/default/${flow.id}`}
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
                  className="h-8 w-8 cursor-pointer p-0"
                  onClick={handleDelete}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete template</TooltipContent>
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
                      className="h-8 w-8 cursor-pointer p-0">
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
    </div>
  );
}
