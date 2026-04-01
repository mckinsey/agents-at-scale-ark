'use client';

import { Cog, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import type {
  ExecutionEngine,
  ExecutionEnginePhase,
} from '@/lib/services/engines';

import { BaseCard, type BaseCardAction } from './base-card';

const PHASE_COLORS: Record<ExecutionEnginePhase, string> = {
  ready: 'bg-green-500',
  running: 'bg-yellow-500',
  error: 'bg-red-500',
};

const PHASE_TEXT_COLORS: Record<ExecutionEnginePhase, string> = {
  ready: 'text-green-600',
  running: 'text-yellow-600',
  error: 'text-red-600',
};

interface ExecutionEngineCardProps {
  engine: ExecutionEngine;
  onDelete?: (name: string) => void;
}

export function ExecutionEngineCard({
  engine,
  onDelete,
}: ExecutionEngineCardProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const actions: BaseCardAction[] = [];
  if (onDelete) {
    actions.push({
      icon: Trash2,
      label: 'Delete execution engine',
      onClick: () => setDeleteConfirmOpen(true),
    });
  }

  return (
    <>
      <BaseCard
        title={engine.name}
        description={engine.description || 'Execution Engine'}
        icon={<Cog className="h-5 w-5" />}
        iconClassName="text-muted-foreground"
        actions={actions}>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${PHASE_COLORS[engine.phase]}`}
            />
            <span className={PHASE_TEXT_COLORS[engine.phase]}>
              {engine.phase}
            </span>
          </div>
          {engine.resolvedAddress && (
            <div className="text-muted-foreground truncate font-mono text-xs">
              {engine.resolvedAddress}
            </div>
          )}
          {engine.phase === 'error' && engine.statusMessage && (
            <div className="text-destructive text-xs">
              {engine.statusMessage}
            </div>
          )}
        </div>
      </BaseCard>
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
