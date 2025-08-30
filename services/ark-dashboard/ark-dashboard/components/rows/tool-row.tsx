"use client";

import { Info, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCustomIcon } from "@/lib/utils/icon-resolver";
import { ARK_ANNOTATIONS } from "@/lib/constants/annotations";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Tool } from "@/lib/services/tools";

type ToolRowProps = {
    readonly tool: Tool;
    readonly onInfo?: (tool: Tool) => void;
    readonly onDelete?: (id: string) => void;
    readonly inUse?: boolean;
    readonly inUseReason?: string;
};

export function ToolRow(props: ToolRowProps) {
  const { tool, onInfo, onDelete, inUse, inUseReason } = props;
  
  // Get custom icon or default Wrench icon
  const annotations = tool.annotations as Record<string, string> | undefined;
  const IconComponent = getCustomIcon(annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON], Wrench);
  
  const handleInfo = () => {
    if (onInfo) {
      onInfo(tool);
    }
  };

  return (
      <div className="flex items-center py-3 px-4 bg-card border rounded-md shadow-sm hover:bg-accent/5 transition-colors w-full gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-grow overflow-hidden">
          <IconComponent className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div className="flex flex-col gap-1 min-w-0 max-w-[400px]">
            <p className="font-medium text-sm truncate" title={tool.name}>
              {tool.name}
            </p>
            <p
              className="text-xs text-muted-foreground truncate"
              title={tool.description ?? ""}
            >
              {tool.description ?? "No description"}
            </p>
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
                    onClick={handleInfo}
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View tool details</TooltipContent>
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
                    className={cn(
                      "h-8 w-8 p-0",
                      inUse && "opacity-50 cursor-not-allowed"
                    )}
                    onClick={() => !inUse && onDelete(tool.id)}
                    disabled={inUse}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {inUse
                    ? inUseReason ?? "Tool is used by agents"
                    : "Delete tool"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
  );
}