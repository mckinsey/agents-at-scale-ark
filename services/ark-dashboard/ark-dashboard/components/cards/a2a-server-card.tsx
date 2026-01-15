'use client';

import { Info, Server, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { AvailabilityStatusBadge } from '@/components/ui/availability-status-badge';
import type { AvailabilityStatus } from '@/components/ui/availability-status-badge';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { A2AServerConfiguration } from '@/lib/services/a2a-servers';
import type { A2AServer } from '@/lib/services/a2a-servers';
import { getCustomIcon } from '@/lib/utils/icon-resolver';

import type { BaseCardAction } from './base-card';
import { BaseCard } from './base-card';

interface A2AServerCardProps {
  a2aServer: A2AServer;
  onInfo?: (a2aServer: A2AServer) => void;
  onDelete?: (id: string) => void;
  namespace: string;
  onUpdate?: (a2aServerConfig: A2AServerConfiguration, edit: boolean) => void;
}

export function A2AServerCard({
  a2aServer,
  onInfo,
  onDelete,
}: A2AServerCardProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const actions: BaseCardAction[] = [];

  // Get custom icon or default Server icon
  const annotations = a2aServer.annotations as
    | Record<string, string>
    | undefined;
  const IconComponent = getCustomIcon(
    annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    Server,
  );

  if (onInfo) {
    actions.push({
      icon: Info,
      label: 'View a2a server details',
      onClick: () => onInfo(a2aServer),
    });
  }

  if (onDelete) {
    actions.push({
      icon: Trash2,
      label: 'Delete a2a server',
      onClick: () => setDeleteConfirmOpen(true),
      disabled: false,
    });
  }

  const address = a2aServer.address || 'Address not available';

  const availabilityStatus: AvailabilityStatus = a2aServer.ready
    ? 'True'
    : 'False';

  return (
    <>
      <BaseCard
        title={a2aServer.name || 'Unnamed Server'}
        icon={<IconComponent className="h-5 w-5" />}
        iconClassName="text-muted-foreground"
        actions={actions}
        footer={
          <div className="text-muted-foreground flex flex-col gap-1 text-sm">
            <div className="w-fit">
              <AvailabilityStatusBadge
                status={availabilityStatus}
                eventsLink={`/events?kind=A2AServer&name=${a2aServer.name}&page=1`}
              />
            </div>
            <div>
              <span className="font-medium">Address:</span> {address}
            </div>
            {a2aServer.status_message && (
              <div className="text-xs text-red-600 dark:text-red-400">
                {a2aServer.status_message}
              </div>
            )}
          </div>
        }
      />
      {onDelete && (
        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete A2A Server"
          description={`Do you want to delete "${a2aServer.name}" A2A server? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={() => onDelete(a2aServer.id)}
          variant="destructive"
        />
      )}
    </>
  );
}
