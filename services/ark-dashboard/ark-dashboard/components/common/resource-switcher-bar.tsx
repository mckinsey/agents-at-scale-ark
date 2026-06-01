'use client';

import { Code } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ResourceSwitcherBarProps {
  value: string | undefined;
  placeholder: string;
  items: { name: string }[];
  loading?: boolean;
  onSelect: (value: string) => void;
  showYaml: boolean;
  onToggleYaml: () => void;
}

/**
 * Left-panel header bar shared by the agent and team view/edit forms: a
 * borderless resource picker plus a YAML toggle.
 */
export function ResourceSwitcherBar({
  value,
  placeholder,
  items,
  loading = false,
  onSelect,
  showYaml,
  onToggleYaml,
}: ResourceSwitcherBarProps) {
  return (
    <div className="bg-surface-secondary border-stroke-divider flex items-center gap-2 border-b px-5 py-2">
      <Select value={value} onValueChange={v => onSelect(v as string)}>
        <SelectTrigger className="!h-8 !w-auto !gap-1 !border-0 !bg-transparent !p-0 text-sm font-medium !shadow-none hover:!bg-transparent focus:!ring-0 focus-visible:!ring-0 focus-visible:!bg-transparent data-[popup-open]:!bg-transparent">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {loading ? (
            <SelectItem value="loading" disabled>
              Loading...
            </SelectItem>
          ) : (
            items.map(item => (
              <SelectItem key={item.name} value={item.name}>
                {item.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <Button
        variant={showYaml ? 'secondary' : 'ghost'}
        size="xs"
        onClick={onToggleYaml}
        className="gap-1">
        <IconShell size="sm">
          <Code />
        </IconShell>
        YAML
      </Button>
    </div>
  );
}
