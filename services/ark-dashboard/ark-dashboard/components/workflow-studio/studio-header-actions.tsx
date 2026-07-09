'use client';

import { Activity, Download, ExternalLink, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DeleteWorkflowTemplateDialog } from '@/components/dialogs/delete-workflow-template-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  draftYaml: string;
  persisted: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unknown error occurred';
}

export function StudioHeaderActions({
  workflowName,
  draftYaml,
  persisted,
}: StudioHeaderActionsProps) {
  const { namespace, readOnlyMode } = useNamespace();
  const { push } = useNamespacedNavigation();

  const [activityOpen, setActivityOpen] = useState(false);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  useEffect(() => {
    if (!activityOpen || !persisted || !workflowName) {
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
  }, [activityOpen, persisted, workflowName]);

  const handleOpenInArgo = useCallback(() => {
    const url = `${ARGO_BASE_URL}/workflow-templates/${namespace}/${workflowName}`;
    window.open(url, '_blank', 'noopener');
  }, [namespace, workflowName]);

  const handleDownloadYaml = useCallback(() => {
    if (!draftYaml.trim()) {
      return;
    }
    const blob = new Blob([draftYaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${workflowName || 'workflow'}.yaml`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setDownloadOpen(false);
  }, [draftYaml, workflowName]);

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

  return (
    <TooltipProvider>
      <div
        className="flex items-center gap-2"
        data-testid="studio-header-actions-content">
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
                  <Activity className="mr-2 h-4 w-4" />
                  Activity
                  <Badge
                    variant="secondary"
                    className="ml-2"
                    data-testid="studio-activity-badge">
                    {totalRuns}
                  </Badge>
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
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Total</span>
                  <span
                    className="text-lg font-semibold"
                    data-testid="studio-activity-total">
                    {stats?.total ?? 0}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Succeeded</span>
                  <span
                    className="text-lg font-semibold"
                    data-testid="studio-activity-succeeded">
                    {stats?.succeeded ?? 0}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Running</span>
                  <span
                    className="text-lg font-semibold"
                    data-testid="studio-activity-running">
                    {stats?.running ?? 0}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Failed</span>
                  <span
                    className="text-lg font-semibold"
                    data-testid="studio-activity-failed">
                    {stats?.failed ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

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
              <ExternalLink className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {persisted ? 'Open in Argo' : notPersistedTip}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Download workflow"
              disabled={!draftYaml.trim()}
              onClick={() => setDownloadOpen(true)}
              data-testid="studio-download">
              <Download className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download</TooltipContent>
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
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {persisted ? 'Delete template' : notPersistedTip}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <DeleteWorkflowTemplateDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        templateName={workflowName}
        onConfirm={() => void handleConfirmDelete()}
      />

      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Download workflow</DialogTitle>
            <DialogDescription>
              Export the current workflow definition.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="justify-start"
              disabled={!draftYaml.trim()}
              onClick={handleDownloadYaml}
              data-testid="studio-download-yaml">
              <Download className="mr-2 h-4 w-4" />
              YAML
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    disabled
                    data-testid="studio-download-diagram">
                    <Download className="mr-2 h-4 w-4" />
                    Diagram
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Diagram export coming soon</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    disabled
                    data-testid="studio-download-both">
                    <Download className="mr-2 h-4 w-4" />
                    Both
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Diagram export coming soon</TooltipContent>
            </Tooltip>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDownloadOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
