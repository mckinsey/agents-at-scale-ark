'use client';

import { Code } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import {
  GHOST_TRIGGER,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface ResourceSwitcherBarProps {
  value: string | undefined;
  placeholder: string;
  items: { name: string }[];
  loading?: boolean;
  onSelect: (value: string) => void;
  showYaml: boolean;
  onToggleYaml: () => void;
}

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
        <SelectTrigger
          className={cn(GHOST_TRIGGER, 'h-8 w-auto gap-1 text-sm font-medium')}>
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
