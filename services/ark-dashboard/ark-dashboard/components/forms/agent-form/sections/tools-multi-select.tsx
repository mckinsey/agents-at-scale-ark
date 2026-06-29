'use client';

import { useMemo } from 'react';

import { NumericBadge } from '@/components/ui/badge';
import {
  Combobox,
  ComboboxAnchor,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { Tag } from '@/components/ui/tag';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Tool } from '@/lib/services';
import { cn } from '@/lib/utils';

const MAX_VISIBLE_CHIPS = 4;

interface ToolsMultiSelectProps {
  readonly availableTools: Tool[];
  readonly isToolSelected: (name: string) => boolean;
  readonly onToggle: (tool: Tool, checked: boolean) => void;
  readonly toolsLoading?: boolean;
  readonly disabled?: boolean;
  readonly unavailableTools?: Tool[];
  readonly onDeleteUnavailable?: (tool: Tool) => void;
  readonly triggerClassName?: string;
}

// Ghost underline field to match the agent form's other inputs (overrides the
// Combobox chips' default bordered/rounded surface).
const CHIPS_TRIGGER_CLASS =
  'min-h-9 rounded-none border-0 border-b border-white/[0.24] bg-transparent px-0 transition-colors focus-within:border-b-stroke-status-focus focus-within:ring-0 focus-within:shadow-none hover:border-b-white/40';

function toolMatchesQuery(tool: Tool, query: string): boolean {
  const q = query.toLowerCase();
  return (
    tool.name.toLowerCase().includes(q) ||
    !!tool.description?.toLowerCase().includes(q)
  );
}

export function ToolsMultiSelect({
  availableTools,
  isToolSelected,
  onToggle,
  toolsLoading = false,
  disabled = false,
  unavailableTools = [],
  onDeleteUnavailable,
  triggerClassName,
}: ToolsMultiSelectProps) {
  const selectedTools = useMemo(
    () => availableTools.filter(tool => isToolSelected(tool.name)),
    [availableTools, isToolSelected],
  );

  // Combobox reports the full next selection; diff it against the current
  // selection and forward each change to the existing per-tool toggle handler.
  const handleValueChange = (next: Tool[]) => {
    const nextNames = new Set(next.map(tool => tool.name));
    const prevNames = new Set(selectedTools.map(tool => tool.name));
    next.forEach(tool => {
      if (!prevNames.has(tool.name)) onToggle(tool, true);
    });
    selectedTools.forEach(tool => {
      if (!nextNames.has(tool.name)) onToggle(tool, false);
    });
  };

  const placeholder = toolsLoading ? 'Loading tools...' : 'Select tools';
  const fieldDisabled = disabled || toolsLoading;

  const visibleChips = selectedTools.slice(0, MAX_VISIBLE_CHIPS);
  const overflowCount = selectedTools.length - visibleChips.length;

  return (
    <div className="flex flex-col gap-2">
      <Combobox
        items={availableTools}
        multiple
        value={selectedTools}
        onValueChange={handleValueChange}
        itemToStringLabel={(tool: Tool) => tool.name}
        isItemEqualToValue={(a: Tool, b: Tool) => a.name === b.name}
        filter={(tool: Tool, query: string) => toolMatchesQuery(tool, query)}
        disabled={fieldDisabled}>
        <ComboboxAnchor>
          <ComboboxChips className={cn(CHIPS_TRIGGER_CLASS, triggerClassName)}>
            {visibleChips.map(tool => (
              <ComboboxChip key={tool.name} aria-label={tool.name}>
                {tool.name}
              </ComboboxChip>
            ))}
            {overflowCount > 0 && (
              <NumericBadge size="sm" variant="primary">
                {overflowCount}
              </NumericBadge>
            )}
            <ComboboxChipsInput
              placeholder={selectedTools.length === 0 ? placeholder : ''}
              aria-label="Select tools"
              disabled={fieldDisabled}
            />
          </ComboboxChips>
        </ComboboxAnchor>
        <ComboboxContent>
          <ComboboxEmpty>
            {availableTools.length === 0
              ? 'No tools available in this namespace'
              : 'No tools found'}
          </ComboboxEmpty>
          <ComboboxList>
            {(tool: Tool) => {
              const description = tool.description?.trim();
              return (
                <ComboboxItem key={tool.name} value={tool}>
                  {description ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>{tool.name}</span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="start">
                        {description}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    tool.name
                  )}
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {unavailableTools.length > 0 && onDeleteUnavailable && (
        <div className="flex flex-wrap gap-2">
          {unavailableTools.map(tool => (
            <Tag
              key={tool.name}
              size="xs"
              variant="outline"
              className="border-status-error text-status-error"
              onRemove={() => onDeleteUnavailable(tool)}>
              {tool.name}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
}
