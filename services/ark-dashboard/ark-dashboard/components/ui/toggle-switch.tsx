'use client';

import { cn } from '@/lib/utils';

export interface ToggleOption {
  id: string;
  label: string;
  active: boolean;
}

interface ToggleSwitchProps {
  readonly options: ReadonlyArray<ToggleOption>;
  readonly onChange: (id: string) => void;
  readonly className?: string;
}

export function ToggleSwitch({
  options,
  onChange,
  className,
}: ToggleSwitchProps) {
  if (!options || !Array.isArray(options) || options.length < 2) {
    return null;
  }

  return (
    <div className={cn('flex items-center', className)}>
      {options.map((option, index) => {
        const isFirst = index === 0;
        const isLast = index === options.length - 1;

        return (
          <button
            key={option.id}
            className={cn(
              'cursor-pointer border border-gray-300 px-3 py-1 text-sm transition-colors',
              {
                'bg-primary': option.active,
                'text-primary-foreground': option.active,
                'rounded-l-sm rounded-tr-none rounded-br-none border-r-0':
                  isFirst,
                'rounded-tl-none rounded-r-sm rounded-bl-none': isLast,
                'border-r-0': !isFirst && !isLast,
              },
            )}
            onClick={() => onChange(option.id)}
            type="button"
            aria-pressed={option.active}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
