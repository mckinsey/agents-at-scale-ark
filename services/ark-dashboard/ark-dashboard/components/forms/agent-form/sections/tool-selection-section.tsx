'use client';

import { useMemo, useState } from 'react';

import {
  ChevronRight,
  ErrorIcon,
  Handyman,
  Trash,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Tool } from '@/lib/services';
import { groupToolsByLabel } from '@/lib/utils/groupToolsByLabels';

import type { ToolSelectionSectionProps } from '../types';

interface ToolItemProps {
  tool: Tool;
  isSelected: boolean;
  onToggle: (tool: Tool, checked: boolean) => void;
  isUnavailable?: boolean;
  onDeleteClick?: (tool: Tool) => void;
  disabled?: boolean;
}

function ToolItem({
  tool,
  isSelected,
  onToggle,
  isUnavailable = false,
  onDeleteClick,
  disabled = false,
}: ToolItemProps) {
  return (
    <div className="flex flex-row items-start justify-between py-1">
      <div className="flex w-fit items-start space-x-2">
        {isUnavailable ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="text-left" tabIndex={-1}>
                <IconShell
                  size="sm"
                  variant="primary"
                  className="text-status-error mt-0.5">
                  <ErrorIcon />
                </IconShell>
              </TooltipTrigger>
              <TooltipContent>
                <p>This tool is unavailable in the system</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Checkbox
            id={`tool-${tool.id || tool.name}`}
            checked={isSelected}
            onCheckedChange={checked => onToggle(tool, !!checked)}
            className="mt-0.5"
            disabled={disabled}
          />
        )}
        <Label
          htmlFor={`tool-${tool.id || tool.name}`}
          className="flex flex-1 cursor-pointer flex-col items-start gap-0.5 text-sm font-normal">
          <span className="font-medium">{tool.name}</span>
          {tool.description && (
            <span className="text-fg-tertiary text-xs">
              {tool.description}
            </span>
          )}
        </Label>
      </div>
      {isUnavailable && onDeleteClick && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${tool.name}`}
          className="hover:text-status-error"
          onClick={() => onDeleteClick(tool)}>
          <IconShell size="sm">
            <Trash />
          </IconShell>
        </Button>
      )}
    </div>
  );
}

interface ToolGroupProps {
  toolGroup: { groupName: string; tools: Tool[] };
  onToggle: (tool: Tool, checked: boolean) => void;
  isToolSelected: (name: string) => boolean;
  unavailableTools?: Tool[];
  onDeleteClick?: (tool: Tool) => void;
  disabled?: boolean;
}

function ToolGroup({
  toolGroup,
  onToggle,
  isToolSelected,
  unavailableTools = [],
  onDeleteClick,
  disabled = false,
}: ToolGroupProps) {
  return (
    <Collapsible defaultOpen className="group/collapsible">
      <CollapsibleTrigger className="flex w-full items-center justify-between py-2">
        <Label className="cursor-pointer text-sm">{toolGroup.groupName}</Label>
        <IconShell
          size="sm"
          variant="secondary"
          className="transition-transform group-data-[state=open]/collapsible:rotate-90">
          <ChevronRight />
        </IconShell>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1 pb-2 pl-2">
          {toolGroup.tools?.map(tool => (
            <ToolItem
              key={`tool-${tool.id || tool.name}`}
              tool={tool}
              isSelected={isToolSelected(tool.name)}
              onToggle={onToggle}
              isUnavailable={unavailableTools.some(t => t.name === tool.name)}
              onDeleteClick={onDeleteClick}
              disabled={disabled}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ToolSelectionSection({
  availableTools,
  toolsLoading,
  onToolToggle,
  isToolSelected,
  unavailableTools = [],
  onDeleteClick,
  disabled = false,
}: ToolSelectionSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTools = [...availableTools].filter(
    tool =>
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool?.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const groupedTools = useMemo(
    () => groupToolsByLabel(filteredTools),
    [filteredTools],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <IconShell size="sm" variant="secondary">
          <Handyman />
        </IconShell>
        <h3 className="text-fg-secondary text-xs font-semibold tracking-wide uppercase">
          Tools
        </h3>
        <span className="text-fg-tertiary ml-auto text-xs">
          {
            [...availableTools, ...unavailableTools].filter(t =>
              isToolSelected(t.name),
            ).length
          }{' '}
          selected
        </span>
      </div>

      {toolsLoading ? (
        <div className="text-fg-secondary flex items-center gap-2 text-sm">
          <Spinner className="h-4 w-4" />
          Loading tools...
        </div>
      ) : availableTools.length === 0 && unavailableTools.length === 0 ? (
        <div className="text-fg-secondary text-sm">
          No tools available in this namespace
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder="Filter tools..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="border-stroke-divider text-sm"
            disabled={disabled}
          />
          <ScrollArea className="border-stroke-divider border [&_[data-slot=scroll-area-viewport]]:max-h-[300px]">
            <div className="space-y-1 p-3">
            {unavailableTools.length > 0 && onDeleteClick && (
              <ToolGroup
                toolGroup={{
                  groupName: 'Unavailable Tools',
                  tools: unavailableTools,
                }}
                onToggle={onToolToggle}
                isToolSelected={isToolSelected}
                unavailableTools={unavailableTools}
                onDeleteClick={onDeleteClick}
                disabled={disabled}
              />
            )}
            {filteredTools.length === 0 && searchQuery ? (
              <div className="text-fg-secondary py-4 text-center text-sm">
                No tools found matching &quot;{searchQuery}&quot;
              </div>
            ) : (
              groupedTools?.map((toolGroup, index) => (
                <ToolGroup
                  key={`${toolGroup.groupName}-${index}`}
                  toolGroup={toolGroup}
                  onToggle={onToolToggle}
                  isToolSelected={isToolSelected}
                  unavailableTools={unavailableTools}
                  onDeleteClick={onDeleteClick}
                  disabled={disabled}
                />
              ))
            )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
