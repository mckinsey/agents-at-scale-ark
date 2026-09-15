'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { ChevronDown } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface Target {
  type: string;
  name: string;
}

interface QueryTargetsFieldProps {
  value: Target[] | undefined;
  onChange?: (targets: Target[]) => void;
  availableTargets: AvailableTarget[];
  loading?: boolean;
}

interface AvailableTarget {
  name: string;
  type: 'agent' | 'model' | 'team' | 'tool';
}

const INLINE_TRIGGER_STYLES =
  'border-stroke-tertiary hover:border-stroke-secondary focus-visible:border-stroke-status-focus h-auto w-full min-w-0 justify-between rounded-none border-0 border-b bg-transparent px-0 py-2 text-sm font-normal transition-colors focus:ring-0 focus-visible:ring-0';

export function QueryTargetsField({
  value = [],
  onChange,
  availableTargets,
  loading = false,
}: QueryTargetsFieldProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Focus filter input when popover opens
  useEffect(() => {
    if (open && filterInputRef.current) {
      filterInputRef.current.focus();
    }
  }, [open]);

  const handleTargetToggle = (target: AvailableTarget, checked: boolean) => {
    if (!onChange) return;

    const newTargets = checked
      ? [...value, { type: target.type, name: target.name }]
      : value.filter(t => !(t.type === target.type && t.name === target.name));

    onChange(newTargets);
  };

  const isTargetSelected = (target: AvailableTarget) => {
    return value.some(t => t.type === target.type && t.name === target.name);
  };

  const filteredTargets = useMemo(() => {
    return availableTargets.filter(target =>
      target.name.toLowerCase().includes(filter.toLowerCase()),
    );
  }, [availableTargets, filter]);

  const groupedTargets = useMemo(() => {
    return filteredTargets.reduce(
      (acc, target) => {
        if (!acc[target.type]) acc[target.type] = [];
        acc[target.type].push(target);
        return acc;
      },
      {} as Record<string, AvailableTarget[]>,
    );
  }, [filteredTargets]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={INLINE_TRIGGER_STYLES}
          disabled={loading}>
          <span
            className={`min-w-0 truncate ${value.length === 0 ? 'text-fg-tertiary' : 'text-fg-primary'}`}>
            {loading
              ? 'Loading...'
              : value.length > 0
                ? value.map(t => `${t.type}:${t.name}`).join(', ')
                : 'Select Targets'}
          </span>
          <IconShell size="sm" variant="secondary">
            <ChevronDown />
          </IconShell>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 border-0 p-0">
        {loading ? (
          <div className="text-fg-tertiary p-3 text-sm">Loading targets...</div>
        ) : (
          <>
            <div className="p-2">
              <Input
                ref={filterInputRef}
                placeholder="Filter targets..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                size="sm"
              />
            </div>
            <div className="border-stroke-divider border-t" />
            <div className="max-h-64 overflow-auto p-1">
              {Object.entries(groupedTargets).map(([type, targets]) => (
                <div key={type}>
                  <div className="text-fg-secondary px-2 py-1.5 text-xs font-medium capitalize">
                    {type}s
                  </div>
                  <div className="pb-1">
                    {targets.map(target => (
                      <label
                        key={`${target.type}-${target.name}`}
                        htmlFor={`${target.type}-${target.name}`}
                        className="hover:bg-fill-muted flex cursor-pointer items-center gap-3 rounded px-2 py-2">
                        <Checkbox
                          id={`${target.type}-${target.name}`}
                          checked={isTargetSelected(target)}
                          onCheckedChange={checked =>
                            handleTargetToggle(target, !!checked)
                          }
                        />
                        <span className="text-fg-primary min-w-0 flex-1 truncate text-sm">
                          {target.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(groupedTargets).length === 0 && (
                <div className="text-fg-tertiary p-3 text-sm">
                  {filter
                    ? 'No targets match your filter'
                    : 'No targets available'}
                </div>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
