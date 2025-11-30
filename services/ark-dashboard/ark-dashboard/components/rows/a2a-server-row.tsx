'use client';

import { Info, Server, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { AvailabilityStatusBadge } from '@/components/ui/availability-status-badge';
import type { AvailabilityStatus } from '@/components/ui/availability-status-badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { A2AServer } from '@/lib/services';
import { getCustomIcon } from '@/lib/utils/icon-resolver';

interface A2AServerRowProps {
  a2aServer: A2AServer;
  onInfo?: (a2aServer: A2AServer) => void;
  onDelete?: (id: string) => void;
}

export function A2AServerRow({
  a2aServer,
  onInfo,
  onDelete,
}: A2AServerRowProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Get custom icon or default Server icon
  const annotations = a2aServer.annotations as
    | Record<string, string>
    | undefined;
  const IconComponent = getCustomIcon(
    annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    Server,
  );

  const address = a2aServer.address || 'Address not available';

  const availabilityStatus: AvailabilityStatus = a2aServer.ready
    ? 'True'
    : 'False';

  return (
    <>
      <div className="bg-card hover:bg-accent/5 flex w-full flex-wrap items-center gap-4 rounded-md border px-4 py-3 shadow-sm transition-colors">
        <div className="flex flex-grow items-center gap-3 overflow-hidden">
          <IconComponent className="text-muted-foreground h-5 w-5 flex-shrink-0" />

          <div className="flex max-w-[400px] min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <p
                className="truncate text-sm font-medium"
                title={a2aServer.name}>
                {a2aServer.name || 'Unnamed Server'}
              </p>
              <AvailabilityStatusBadge
                status={availabilityStatus}
                eventsLink={`/events?kind=A2AServer&name=${a2aServer.name}&page=1`}
              />
            </div>
            <p
              className="text-muted-foreground truncate text-xs"
              title={address}>
              {address}
            </p>
            {a2aServer.status_message && (
              <p className="truncate text-xs text-red-600 dark:text-red-400">
                {a2aServer.status_message}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {onInfo && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onInfo(a2aServer)}>
                    <Info className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View A2A server details</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {onDelete && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:bg-destructive/10 hover:text-destructive h-8 w-8 p-0"
                    onClick={() => setDeleteConfirmOpen(true)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete A2A server</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
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
