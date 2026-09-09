'use client';

import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Settings, Trash } from '@/components/icons';
import { IconActionButton } from '@/components/ui/icon-action-button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { DOCS_URLS } from '@/lib/constants/docs';
import type {
  ExecutionEngine,
  ExecutionEnginePhase,
} from '@/lib/services/engines';
import {
  useDeleteExecutionEngine,
  useGetAllExecutionEngines,
} from '@/lib/services/engines-hooks';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

import { LearnMoreButton, ResourceEmptyState } from './resource-list-states';

const COL = {
  name: 'w-[200px]',
  address: 'w-[260px]',
  status: 'w-[140px]',
  action: 'w-[80px]',
};

interface PhaseConfig {
  label: string;
  dotClass: string;
}

const PHASE_CONFIG: Record<ExecutionEnginePhase, PhaseConfig> = {
  ready: { label: 'Ready', dotClass: 'bg-status-success' },
  running: { label: 'Running', dotClass: 'bg-status-warning' },
  error: { label: 'Error', dotClass: 'bg-status-error' },
};

const UNKNOWN_PHASE_CONFIG: PhaseConfig = {
  label: 'Unknown',
  dotClass: 'bg-fg-tertiary',
};

function EngineStatus({ engine }: Readonly<{ engine: ExecutionEngine }>) {
  const config = PHASE_CONFIG[engine.phase] ?? UNKNOWN_PHASE_CONFIG;

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="inline-flex items-center gap-2">
        <span className={cn('size-2 rounded-full', config.dotClass)} />
        <span className="label-regular-primary text-fg-primary">
          {config.label}
        </span>
      </span>
      {engine.phase === 'error' && engine.statusMessage && (
        <TruncatedTooltip label={engine.statusMessage}>
          <span className="text-status-error block w-full truncate text-xs">
            {engine.statusMessage}
          </span>
        </TruncatedTooltip>
      )}
    </div>
  );
}

interface EngineTableRowProps {
  readonly engine: ExecutionEngine;
  readonly onDelete?: (name: string) => void;
}

function EngineTableRow({ engine, onDelete }: EngineTableRowProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <>
      <TableRow>
        <TableCell size="small" className={COL.name}>
          <TruncatedTooltip label={engine.name}>
            <span className="text-fg-primary block w-full truncate">
              {engine.name}
            </span>
          </TruncatedTooltip>
        </TableCell>
        <TableCell size="small" className="max-w-0">
          <TruncatedTooltip label={engine.description ?? 'No description'}>
            <span className="text-fg-secondary block w-full truncate">
              {engine.description ?? 'No description'}
            </span>
          </TruncatedTooltip>
        </TableCell>
        <TableCell size="small" className={COL.address}>
          {engine.resolvedAddress ? (
            <TruncatedTooltip label={engine.resolvedAddress}>
              <span className="text-fg-secondary block w-full truncate font-mono text-xs">
                {engine.resolvedAddress}
              </span>
            </TruncatedTooltip>
          ) : (
            <span className="text-fg-tertiary">—</span>
          )}
        </TableCell>
        <TableCell size="small" className={COL.status}>
          <EngineStatus engine={engine} />
        </TableCell>
        <TableCell size="small" className={cn(COL.action, 'relative z-10')}>
          <div className="flex items-center justify-center gap-2">
            {onDelete && (
              <IconActionButton
                label="Delete execution engine"
                onClick={() => setDeleteConfirmOpen(true)}>
                <Trash />
              </IconActionButton>
            )}
          </div>
        </TableCell>
      </TableRow>
      {onDelete && (
        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete Execution Engine"
          description={`Do you want to delete "${engine.name}"? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={() => onDelete(engine.name)}
          variant="destructive"
        />
      )}
    </>
  );
}

export function ExecutionEnginesSection() {
  const { readOnlyMode } = useNamespace();
  const { data: engines, isLoading } = useGetAllExecutionEngines();
  const deleteEngine = useDeleteExecutionEngine();

  const handleDelete = (name: string) => {
    if (readOnlyMode) return;
    deleteEngine.mutate(name);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-fg-secondary paragraph-regular-primary py-8">
          Loading...
        </div>
      </div>
    );
  }

  if (!engines || engines.length === 0) {
    return (
      <ResourceEmptyState
        icon={<Settings />}
        title="No execution engines yet"
        description={
          <>
            <p>No execution engines found in this namespace.</p>
            <p>Use kubectl to create one.</p>
          </>
        }
        actions={<LearnMoreButton href={DOCS_URLS.executionEngines} />}
      />
    );
  }

  return (
    <Table
      aria-label="Execution engines"
      className="min-w-[1000px] table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small" className={COL.name}>
            Name
          </TableHead>
          <TableHead size="small">Description</TableHead>
          <TableHead size="small" className={COL.address}>
            Address
          </TableHead>
          <TableHead size="small" className={COL.status}>
            Status
          </TableHead>
          <TableHead size="small" className={COL.action}>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {engines.map(engine => (
          <EngineTableRow
            key={engine.name}
            engine={engine}
            onDelete={readOnlyMode ? undefined : handleDelete}
          />
        ))}
      </TableBody>
    </Table>
  );
}
