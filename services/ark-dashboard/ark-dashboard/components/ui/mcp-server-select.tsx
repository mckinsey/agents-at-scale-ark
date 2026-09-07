'use client';

import { useMemo } from 'react';

import {
  GHOST_TRIGGER,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  ALL_MCP_SERVERS_LABEL,
  ALL_MCP_SERVERS_VALUE,
} from '@/lib/utils/mcp-header-overrides';

export interface McpServerSelectProps {
  readonly id: string;
  readonly serverNames: string[];
  readonly value?: string;
  readonly disabled?: boolean;
  readonly onChange: (serverName: string | undefined) => void;
  readonly className?: string;
}

export function McpServerSelect({
  id,
  serverNames,
  value,
  disabled,
  onChange,
  className,
}: McpServerSelectProps) {
  const items = useMemo(() => {
    const names = new Set(serverNames);
    if (value) names.add(value);

    return [
      { value: ALL_MCP_SERVERS_VALUE, label: ALL_MCP_SERVERS_LABEL },
      ...Array.from(names)
        .sort((a, b) => a.localeCompare(b))
        .map(name => ({ value: name, label: name })),
    ];
  }, [serverNames, value]);

  return (
    <Select
      items={items}
      value={value ?? ALL_MCP_SERVERS_VALUE}
      onValueChange={next => {
        const selected = String(next);
        onChange(selected === ALL_MCP_SERVERS_VALUE ? undefined : selected);
      }}
      disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label="MCP server"
        className={cn(GHOST_TRIGGER, 'h-10 w-full min-w-0', className)}>
        <SelectValue placeholder={ALL_MCP_SERVERS_LABEL} />
      </SelectTrigger>
      <SelectContent className="bg-fill-onsurface-ui-2">
        {items.map(item => (
          <SelectItem key={item.value} value={item.value}>
            <SelectItemText>{item.label}</SelectItemText>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
