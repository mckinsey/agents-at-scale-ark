'use client';

import { GitBranch, Pencil, Play, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { Flow } from '@/lib/types/flow';

import { BaseCard, type BaseCardAction } from './base-card';

interface FlowCardProps {
  flow: Flow;
  onRun: (flow: Flow) => void;
  onEdit: (flow: Flow) => void;
  onDelete: (flow: Flow) => void;
}

export function FlowCard({ flow, onRun, onEdit, onDelete }: FlowCardProps) {
  const actions: BaseCardAction[] = [
    {
      icon: Play,
      label: 'Run flow',
      onClick: () => onRun(flow),
      className: 'text-green-600',
    },
    {
      icon: Pencil,
      label: 'Edit flow',
      onClick: () => onEdit(flow),
    },
    {
      icon: Trash2,
      label: 'Delete flow',
      onClick: () => onDelete(flow),
      className: 'text-destructive',
    },
  ];

  return (
    <BaseCard
      title={flow.name}
      icon={GitBranch}
      actions={actions}
      description={flow.description}
      footer={
        <div className="flex w-full items-center justify-between pt-2 pb-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {flow.templateName}
            </Badge>
            <span className="text-muted-foreground text-xs">
              {flow.parameters.length} parameter
              {flow.parameters.length !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-muted-foreground text-xs">
            {flow.templateNamespace}
          </span>
        </div>
      }>
      {flow.parameters.length > 0 && (
        <div className="space-y-1">
          {flow.parameters.slice(0, 3).map(param => (
            <div key={param.name} className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground font-mono text-xs">
                {param.name}:
              </span>
              <span className="truncate text-xs">
                {param.value || '(empty)'}
              </span>
            </div>
          ))}
          {flow.parameters.length > 3 && (
            <span className="text-muted-foreground text-xs">
              +{flow.parameters.length - 3} more
            </span>
          )}
        </div>
      )}
    </BaseCard>
  );
}
