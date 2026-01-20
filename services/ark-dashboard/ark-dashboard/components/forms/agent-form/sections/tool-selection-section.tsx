'use client';

import { ChevronRight, CircleAlert, Trash2, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
                <CircleAlert className="text-destructive mt-0.5 h-4 w-4" />
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
            <span className="text-muted-foreground text-xs">
              {tool.description}
            </span>
          )}
        </Label>
      </div>
      {isUnavailable && onDeleteClick && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hover:text-destructive h-6 w-6 p-0"
          onClick={() => onDeleteClick(tool)}>
          <Trash2 className="h-3 w-3" />
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
        <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
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
        <Wrench className="text-muted-foreground h-4 w-4" />
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Tools
        </h3>
        <span className="text-muted-foreground ml-auto text-xs">
          {
            [...availableTools, ...unavailableTools].filter(t =>
              isToolSelected(t.name),
            ).length
          }{' '}
          selected
        </span>
      </div>

      {toolsLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner className="h-4 w-4" />
          Loading tools...
        </div>
      ) : availableTools.length === 0 && unavailableTools.length === 0 ? (
        <div className="text-muted-foreground text-sm">
          No tools available in this namespace
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            placeholder="Filter tools..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="text-sm"
            disabled={disabled}
          />
          <div className="max-h-[300px] space-y-1 overflow-y-auto rounded-md border p-3">
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
              <div className="text-muted-foreground py-4 text-center text-sm">
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
        </div>
      )}
    </div>
  );
}
