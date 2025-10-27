'use client';

import { ChevronRight, MessageCircle, Trash2, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { Tool } from '@/lib/services/tools';
import { getCustomIcon } from '@/lib/utils/icon-resolver';

import { BaseCard, type BaseCardAction } from './base-card';

interface ToolCardProps {
  tool: Tool;
  onDelete?: (id: string) => void;
  onInfo?: (tool: Tool) => void;
  deleteDisabled?: boolean;
  deleteDisabledReason?: string;
}

export function ToolCard({
  tool,
  onDelete,
  onInfo,
  deleteDisabled,
  deleteDisabledReason,
}: ToolCardProps) {
  const router = useRouter();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const actions: BaseCardAction[] = [];

  // Get custom icon or default Wrench icon
  const annotations = tool.annotations as Record<string, string> | undefined;
  const IconComponent = getCustomIcon(
    annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    Wrench,
  );

  if (onInfo) {
    actions.push({
      icon: ChevronRight,
      label: 'View tool details',
      onClick: () => onInfo(tool),
    });
  }

  if (onDelete) {
    actions.push({
      icon: Trash2,
      label:
        deleteDisabled && deleteDisabledReason
          ? deleteDisabledReason
          : 'Delete tool',
      onClick: () => setDeleteConfirmOpen(true),
      disabled: deleteDisabled,
    });
  }

  actions.push({
    icon: MessageCircle,
    label: 'Query tool',
    onClick: () => router.push(`/query/new?target_tool=${tool.name}`),
  });

  return (
    <>
      <BaseCard
        title={tool.name || tool.type || 'Unnamed Tool'}
        description={tool.type || 'Tool'}
        icon={<IconComponent className="h-5 w-5" />}
        iconClassName="text-muted-foreground"
        actions={actions}>
        <div />
      </BaseCard>
      {onDelete && (
        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete Tool"
          description={`Do you want to delete "${tool.name || tool.type || 'this tool'}" tool? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={() => onDelete(tool.id)}
          variant="destructive"
        />
      )}
    </>
  );
}
