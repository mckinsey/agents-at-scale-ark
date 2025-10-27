'use client';

import { Info, Server } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
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
}

export function A2AServerRow({ a2aServer, onInfo }: A2AServerRowProps) {
  // Get custom icon or default Server icon
  const annotations = a2aServer.annotations as
    | Record<string, string>
    | undefined;
  const IconComponent = getCustomIcon(
    annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    Server,
  );

  // Get the address from either status.lastResolvedAddress or spec.address.value
  const address = a2aServer.address || 'Address not available';

  return (
    <div className="bg-card hover:bg-accent/5 flex w-full flex-wrap items-center gap-4 rounded-md border px-4 py-3 shadow-sm transition-colors">
      <div className="flex flex-grow items-center gap-3 overflow-hidden">
        <IconComponent className="text-muted-foreground h-5 w-5 flex-shrink-0" />

        <div className="flex max-w-[400px] min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium" title={a2aServer.name}>
              {a2aServer.name || 'Unnamed Server'}
            </p>
            <StatusBadge
              ready={a2aServer.ready}
              discovering={a2aServer.discovering}
            />
          </div>
          <p className="text-muted-foreground truncate text-xs" title={address}>
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
      </div>
    </div>
  );
}
