'use client';

import { ChevronRight, MessageCircle, Trash2, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { Tool } from '@/lib/services/tools';
import { cn } from '@/lib/utils';
import { getCustomIcon } from '@/lib/utils/icon-resolver';

type ToolRowProps = {
  readonly tool: Tool;
  readonly onInfo?: (tool: Tool) => void;
  readonly onDelete?: (id: string) => void;
  readonly inUse?: boolean;
  readonly inUseReason?: string;
  readonly namespace?: string;
};

export function ToolRow(props: ToolRowProps) {
  const { tool, onInfo, onDelete, inUse, inUseReason } = props;
  const router = useRouter();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Get custom icon or default Wrench icon
  const annotations = tool.annotations as Record<string, string> | undefined;
  const IconComponent = getCustomIcon(
    annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    Wrench,
  );

  const handleInfo = () => {
    if (onInfo) {
      onInfo(tool);
    }
  };

  const handleQueryTool = () => {
    router.push(`/query/new?target_tool=${tool.name}`);
  };

  return (
    <>
      <div className="bg-card hover:bg-accent/5 flex w-full flex-wrap items-center gap-4 rounded-md border px-4 py-3 shadow-sm transition-colors">
        <div className="flex flex-grow items-center gap-3 overflow-hidden">
          <IconComponent className="text-muted-foreground h-5 w-5 flex-shrink-0" />
          <div className="flex max-w-[400px] min-w-0 flex-col gap-1">
            <p className="truncate text-sm font-medium" title={tool.name}>
              {tool.name}
            </p>
            <p
              className="text-muted-foreground truncate text-xs"
              title={tool.description ?? ''}>
              {tool.description ?? 'No description'}
            </p>
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
                    onClick={handleInfo}>
                    <ChevronRight className="h-4 w-4" />
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
                      'h-8 w-8 p-0',
                      inUse && 'cursor-not-allowed opacity-50',
                    )}
                    onClick={() => !inUse && setDeleteConfirmOpen(true)}
                    disabled={inUse}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {inUse
                    ? (inUseReason ?? 'Tool is used by agents')
                    : 'Delete tool'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleQueryTool}
                  aria-label="Query tool">
                  <MessageCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Query tool</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
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
