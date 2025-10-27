'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Target {
  type: string;
  name: string;
}

interface QueryTargetsFieldProps {
  mode: 'new' | 'view';
  value: Target[] | undefined;
  onChange?: (targets: Target[]) => void;
  label: string;
  availableTargets: AvailableTarget[];
  loading?: boolean;
}

interface AvailableTarget {
  name: string;
  type: 'agent' | 'model' | 'team' | 'tool';
}

const FIELD_HEADING_STYLES =
  'px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 w-1/3 text-left';

export function QueryTargetsField({
  mode,
  value = [],
  onChange,
  label,
  availableTargets,
  loading = false,
}: QueryTargetsFieldProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const filterInputRef = useRef<HTMLInputElement>(null);

  // Focus filter input when dropdown opens
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

  if (mode === 'view') {
    return (
      <tr className="border-b border-gray-100 dark:border-gray-800">
        <td className={FIELD_HEADING_STYLES}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="cursor-help text-left" tabIndex={-1}>
                {label}
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Specific agents, teams, models, or tools that will execute
                  this query
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>
        <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
          {value.length > 0
            ? value.map(t => `${t.type}:${t.name}`).join(', ')
            : '—'}
        </td>
      </tr>
    );
  }

  // New/edit mode
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      <td className={FIELD_HEADING_STYLES}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="cursor-help text-left" tabIndex={-1}>
              {label}
            </TooltipTrigger>
            <TooltipContent>
              <p>
                Specific agents, teams, models, or tools that will execute this
                query
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
      <td className="px-3 py-2">
        <div className="space-y-2">
          {/* Dropdown picker */}
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-full min-w-0 justify-between text-sm font-normal"
                disabled={loading}>
                <span
                  className={`min-w-0 truncate ${value.length === 0 ? 'text-muted-foreground' : ''}`}>
                  {loading
                    ? 'Loading...'
                    : value.length > 0
                      ? value.map(t => `${t.type}:${t.name}`).join(', ')
                      : 'Select Targets'}
                </span>
                <ChevronDown className="ml-1 h-4 w-4 flex-shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80" align="start">
              {loading ? (
                <div className="p-3 text-sm text-gray-500">
                  Loading targets...
                </div>
              ) : (
                <>
                  {/* Filter input */}
                  <div className="p-2">
                    <Input
                      ref={filterInputRef}
                      placeholder="Filter targets..."
                      value={filter}
                      onChange={e => setFilter(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <DropdownMenuSeparator />

                  {/* Target groups */}
                  <div className="max-h-64 overflow-auto">
                    {Object.entries(groupedTargets).map(
                      ([type, targets], index, array) => (
                        <div key={type}>
                          <DropdownMenuLabel className="text-sm font-medium capitalize">
                            {type}s
                          </DropdownMenuLabel>
                          <div className="px-2 pb-2">
                            {targets.map(target => (
                              <div
                                key={`${target.type}-${target.name}`}
                                className="flex items-center space-x-3 rounded px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-800">
                                <Checkbox
                                  id={`${target.type}-${target.name}`}
                                  checked={isTargetSelected(target)}
                                  onCheckedChange={checked =>
                                    handleTargetToggle(target, !!checked)
                                  }
                                />
                                <label
                                  htmlFor={`${target.type}-${target.name}`}
                                  className="flex-1 cursor-pointer truncate text-sm font-normal">
                                  {target.name}
                                </label>
                              </div>
                            ))}
                          </div>
                          {index < array.length - 1 && (
                            <DropdownMenuSeparator />
                          )}
                        </div>
                      ),
                    )}
                    {Object.keys(groupedTargets).length === 0 && (
                      <div className="p-3 text-sm text-gray-500">
                        {filter
                          ? 'No targets match your filter'
                          : 'No targets available'}
                      </div>
                    )}
                  </div>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
}
