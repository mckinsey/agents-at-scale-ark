'use client';

import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { RunWorkflowDialog } from '@/components/dialogs/run-workflow-dialog';
import { MoreVert, OpenInNew, PlayArrow, Trash } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  rowHoverOverlayClass,
} from '@/components/ui/table';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { ARGO_BASE_URL } from '@/lib/constants/workflows';
import type { WorkflowParameter } from '@/lib/services/workflow-templates';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

import type { ResourceListItem } from './resource-list-section';

export interface WorkflowTemplateListItem extends ResourceListItem {
  title?: string;
  stages: number;
  parameters?: WorkflowParameter[];
}

interface WorkflowTemplatesTableProps {
  readonly templates: readonly WorkflowTemplateListItem[];
  readonly onDelete: (id: string) => void;
  readonly onRun: (
    id: string,
    parameters?: Record<string, string>,
    workflowName?: string,
  ) => Promise<void>;
}

const COL = {
  name: 'w-[220px]',
  title: 'w-[200px]',
  stages: 'w-[90px]',
  action: 'w-[72px]',
};

interface WorkflowTemplateTableRowProps {
  readonly template: WorkflowTemplateListItem;
  readonly onDelete: (id: string) => void;
  readonly onRequestRun: () => void;
}

function WorkflowTemplateTableRow({
  template,
  onDelete,
  onRequestRun,
}: Readonly<WorkflowTemplateTableRowProps>) {
  const { namespace, readOnlyMode } = useNamespace();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <>
      <TableRow className="relative isolate cursor-pointer transition-colors">
        <TableCell size="small" className={COL.name}>
          <span aria-hidden className={rowHoverOverlayClass} />
          <TruncatedTooltip label={template.name}>
            <NamespacedLink
              href={`/workflow-templates/${encodeURIComponent(template.id)}`}
              className="text-fg-primary block w-full truncate after:absolute after:inset-0 after:content-['']">
              {template.name}
            </NamespacedLink>
          </TruncatedTooltip>
        </TableCell>
        <TableCell size="small" className={cn(COL.title, 'relative z-10')}>
          <TruncatedTooltip label={template.title ?? '—'}>
            <span className="text-fg-primary block w-full truncate">
              {template.title ?? '—'}
            </span>
          </TruncatedTooltip>
        </TableCell>
        <TableCell size="small" className={COL.stages}>
          <span className="text-fg-primary block truncate">
            {template.stages}
          </span>
        </TableCell>
        <TableCell size="small" className="relative z-10">
          <TruncatedTooltip label={template.description ?? '—'}>
            <span className="text-fg-primary block w-full truncate">
              {template.description ?? '—'}
            </span>
          </TruncatedTooltip>
        </TableCell>
        <TableCell size="small" className={cn(COL.action, 'relative z-10')}>
          <div className="flex items-center justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Workflow template actions">
                  <IconShell size="sm" variant="secondary">
                    <MoreVert />
                  </IconShell>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onRequestRun}>
                  <PlayArrow className="size-4" />
                  Run workflow
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href={`${ARGO_BASE_URL}/workflow-templates/${encodeURIComponent(namespace)}/${encodeURIComponent(template.id)}`}
                    target="_blank"
                    rel="noopener noreferrer">
                    <OpenInNew className="size-4" />
                    Open in Argo
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={readOnlyMode}
                  onSelect={() => setDeleteConfirmOpen(true)}>
                  <Trash className="size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Workflow Template"
        description={`Do you want to delete "${template.name}" workflow template? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => onDelete(template.id)}
        variant="destructive"
      />
    </>
  );
}

export function WorkflowTemplatesTable({
  templates,
  onDelete,
  onRun,
}: Readonly<WorkflowTemplatesTableProps>) {
  const [runTarget, setRunTarget] = useState<WorkflowTemplateListItem | null>(
    null,
  );

  return (
    <>
      <Table
        aria-label="Workflow Templates"
        className="min-w-[800px] table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
        <TableHeader>
          <TableRow>
            <TableHead size="small" className={COL.name}>
              Name
            </TableHead>
            <TableHead size="small" className={COL.title}>
              Title
            </TableHead>
            <TableHead size="small" className={COL.stages}>
              Stages
            </TableHead>
            <TableHead size="small">Description</TableHead>
            <TableHead size="small" className={COL.action}>
              <span className="sr-only">Action</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map(template => (
            <WorkflowTemplateTableRow
              key={template.id}
              template={template}
              onDelete={onDelete}
              onRequestRun={() => setRunTarget(template)}
            />
          ))}
        </TableBody>
      </Table>
      {runTarget && (
        <RunWorkflowDialog
          templateName={runTarget.id}
          parameters={runTarget.parameters}
          open
          onOpenChange={open => {
            if (!open) setRunTarget(null);
          }}
          onRun={(parameters, workflowName) =>
            onRun(runTarget.id, parameters, workflowName)
          }
        />
      )}
    </>
  );
}
