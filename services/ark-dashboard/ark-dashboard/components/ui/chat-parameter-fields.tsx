'use client';

import { useState } from 'react';

import { ChevronDown, Info } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
  readonly requiredParameters: string[];
  readonly values: Record<string, string>;
  readonly onChange: (name: string, value: string) => void;
  readonly disabled?: boolean;
}

export function ChatParameterFields({
  requiredParameters,
  values,
  onChange,
  disabled,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  if (requiredParameters.length === 0) return null;

  const count = requiredParameters.length;

  return (
    <div className="border-stroke-divider flex flex-col gap-3 border-b pb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-fg-secondary text-sm">
            {count} variable{count > 1 ? 's' : ''} available
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About variables"
                className="text-fg-secondary hover:text-fg-primary">
                <IconShell size="sm" variant="secondary">
                  <Info />
                </IconShell>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start">
              These variables were defined at the agent prompt level. To change
              these variables or add new ones, please go to Agent Studio.
            </TooltipContent>
          </Tooltip>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-label={expanded ? 'Collapse variables' : 'Expand variables'}
          aria-expanded={expanded}
          className="text-fg-secondary hover:text-fg-primary">
          <IconShell size="sm" variant="secondary">
            <ChevronDown className={expanded ? 'rotate-180' : ''} />
          </IconShell>
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2">
          {requiredParameters.map(name => (
            <div key={name} className="flex items-center gap-3">
              <span className="text-fg-secondary w-36 shrink-0 truncate text-sm">
                {name}
              </span>
              <Input
                value={values[name] || ''}
                onChange={e => onChange(name, e.target.value)}
                placeholder="Enter value..."
                disabled={disabled}
                className="h-9 flex-1 text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
