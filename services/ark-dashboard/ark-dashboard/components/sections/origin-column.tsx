import { Info } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getOriginLabel } from '@/lib/utils/origin-icon';

const ORIGIN_COL = 'w-[160px] shrink-0';

const headerCellClass =
  'text-fg-secondary border-stroke-tertiary flex h-12 items-end border-b px-3 pt-3 pb-4 text-sm leading-5 tracking-[-0.112px]';

const rowCellClass =
  'border-stroke-tertiary flex h-[60px] items-center border-b px-3';

interface OriginColumnHeaderProps {
  readonly tooltip: string;
}

export function OriginColumnHeader({ tooltip }: OriginColumnHeaderProps) {
  return (
    <div role="columnheader" className={cn(headerCellClass, ORIGIN_COL)}>
      <span className="flex items-center gap-1">
        Origin
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="About Origin"
              className="inline-flex">
              <IconShell size="sm" className="opacity-100">
                <Info />
              </IconShell>
            </button>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </span>
    </div>
  );
}

interface OriginCellProps {
  readonly origin?: string | null;
}

export function OriginCell({ origin }: OriginCellProps) {
  return (
    <div role="cell" className={cn(rowCellClass, ORIGIN_COL)}>
      <span className="text-fg-primary block truncate text-sm leading-5 tracking-[-0.112px]">
        {getOriginLabel(origin)}
      </span>
    </div>
  );
}
