"use client";

import { Server, Info } from "lucide-react";
import { getCustomIcon } from "@/lib/utils/icon-resolver";
import { ARK_ANNOTATIONS } from "@/lib/constants/annotations";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/ui/status-badge";
import type { A2AServer } from "@/lib/services";

interface A2AServerRowProps {
  a2aServer: A2AServer;
  onInfo?: (a2aServer: A2AServer) => void;
}

export function A2AServerRow({
  a2aServer,
  onInfo
}: A2AServerRowProps) {
  // Get custom icon or default Server icon
  const annotations = a2aServer.annotations as Record<string, string> | undefined;
  const IconComponent = getCustomIcon(annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON], Server);

  // Get the address from either status.lastResolvedAddress or spec.address.value
  const address = a2aServer.address || "Address not available";

  return (
    <div className="flex items-center py-3 px-4 bg-card border rounded-md shadow-sm hover:bg-accent/5 transition-colors w-full gap-4 flex-wrap">
      <div className="flex items-center gap-3 flex-grow overflow-hidden">
        <IconComponent className="h-5 w-5 text-muted-foreground flex-shrink-0" />

        <div className="flex flex-col gap-1 min-w-0 max-w-[400px]">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate" title={a2aServer.name}>
              {a2aServer.name || "Unnamed Server"}
            </p>
            <StatusBadge ready={a2aServer.ready} discovering={a2aServer.discovering} />
          </div>
          <p
            className="text-xs text-muted-foreground truncate"
            title={address}
          >
            {address}
          </p>
          {a2aServer.status_message && (
            <p className="text-xs text-red-600 dark:text-red-400 truncate">
              {a2aServer.status_message}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {onInfo && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => onInfo(a2aServer)}
                >
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