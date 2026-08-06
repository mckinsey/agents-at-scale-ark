'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DeleteWorkflowTemplateDialog } from '@/components/dialogs/delete-workflow-template-dialog';
import { ChevronDown, OpenInNew, Trash } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import {
  type WorkflowStats,
  workflowTemplatesService,
} from '@/lib/services/workflow-templates';
import { useNamespace } from '@/providers/NamespaceProvider';

const ARGO_BASE_URL =
  process.env.NEXT_PUBLIC_ARGO_URL || 'http://localhost:2746';

const STATS_POLL_INTERVAL_MS = 30000;

interface StudioHeaderActionsProps {
  workflowName: string;
  persisted: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unknown error occurred';
}

export function StudioHeaderActions({
  workflowName,
  persisted,
}: Readonly<StudioHeaderActionsProps>) {
  const { namespace, readOnlyMode } = useNamespace();
  const { push } = useNamespacedNavigation();

  const [activityOpen, setActivityOpen] = useState(false);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!persisted || !workflowName) {
      return;
    }

    let cancelled = false;

    const fetchStats = async () => {
      try {
        const next = await workflowTemplatesService.getStats(workflowName);
        if (!cancelled) {
          setStats(next);
        }
      } catch {
        if (!cancelled) {
          setStats(null);
        }
      }
    };

    void fetchStats();
    const interval = setInterval(() => {
      void fetchStats();
    }, STATS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [persisted, workflowName]);

  const handleOpenInArgo = useCallback(() => {
    const url = `${ARGO_BASE_URL}/workflow-templates/${namespace}/${workflowName}`;
    window.open(url, '_blank', 'noopener');
  }, [namespace, workflowName]);

  const handleConfirmDelete = useCallback(async () => {
    try {
      await workflowTemplatesService.delete(workflowName);
      toast.success('Workflow template deleted', {
        description: workflowName,
      });
      push('/workflow-templates');
    } catch (error) {
      toast.error('Failed to delete workflow template', {
        description: errorMessage(error),
      });
    }
  }, [workflowName, push]);

  const notPersistedTip = 'Save the workflow first';
  const totalRuns = stats?.total ?? 0;

  const runsHref = (status?: string) => {
    const params = new URLSearchParams({ workflowTemplateName: workflowName });
    if (status) {
      params.set('status', status);
    }
    return `/sessions?${params.toString()}`;
  };

  const activityStats: {
    key: string;
    label: string;
    value: number;
    status?: string;
  }[] = [
    { key: 'total', label: 'Total', value: stats?.total ?? 0 },
    {
      key: 'succeeded',
      label: 'Succeeded',
      value: stats?.succeeded ?? 0,
      status: 'succeeded',
    },
    {
      key: 'running',
      label: 'Running',
      value: stats?.running ?? 0,
      status: 'running',
    },
    {
      key: 'failed',
      label: 'Failed',
      value: stats?.failed ?? 0,
      status: 'failed',
    },
  ];

  return (
    <TooltipProvider>
      <div
        className="flex items-center gap-2"
        data-testid="studio-header-actions-content">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Open in Argo"
              disabled={!persisted}
              onClick={handleOpenInArgo}
              data-testid="studio-open-argo">
              <OpenInNew className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {persisted ? 'Open in Argo' : notPersistedTip}
          </TooltipContent>
        </Tooltip>

        {!readOnlyMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label="Delete workflow"
                disabled={!persisted}
                onClick={() => setDeleteOpen(true)}
                data-testid="studio-delete">
                <Trash className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {persisted ? 'Delete template' : notPersistedTip}
            </TooltipContent>
          </Tooltip>
        )}

        <Popover open={activityOpen} onOpenChange={setActivityOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!persisted}
                  data-testid="studio-activity-trigger">
                  <Badge
                    variant="alternative"
                    className="border-stroke-divider bg-mist-50 text-slate-900 mr-2 size-5 min-w-5 items-center justify-center rounded-full border p-0"
                    data-testid="studio-activity-badge">
                    {totalRuns}
                  </Badge>
                  Activity
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            {!persisted && <TooltipContent>{notPersistedTip}</TooltipContent>}
          </Tooltip>
          <PopoverContent align="end" className="w-64">
            <div
              className="flex flex-col gap-3"
              data-testid="studio-activity-content">
              <div className="text-sm font-semibold">Last 24 hours</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {activityStats.map(stat => (
                  <NamespacedLink
                    key={stat.key}
                    href={runsHref(stat.status)}
                    onClick={() => setActivityOpen(false)}
                    className="hover:bg-fill-subtle flex flex-col p-1 transition-colors"
                    data-testid={`studio-activity-link-${stat.key}`}>
                    <span className="text-fg-secondary">{stat.label}</span>
                    <span
                      className="text-lg font-semibold"
                      data-testid={`studio-activity-${stat.key}`}>
                      {stat.value}
                    </span>
                  </NamespacedLink>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <DeleteWorkflowTemplateDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        templateName={workflowName}
        onConfirm={() => void handleConfirmDelete()}
      />
    </TooltipProvider>
  );
}
