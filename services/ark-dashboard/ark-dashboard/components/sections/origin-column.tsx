import { Info } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import { TableCell, TableHead } from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getOriginLabel } from '@/lib/utils/origin-icon';

const ORIGIN_COL = 'w-[160px]';

interface OriginColumnHeaderProps {
  readonly tooltip: string;
}

export function OriginColumnHeader({
  tooltip,
}: Readonly<OriginColumnHeaderProps>) {
  return (
    <TableHead size="small" className={ORIGIN_COL}>
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
    </TableHead>
  );
}

interface OriginCellProps {
  readonly origin?: string | null;
}

export function OriginCell({ origin }: Readonly<OriginCellProps>) {
  return (
    <TableCell size="small">
      <span className="text-fg-primary block truncate">
        {getOriginLabel(origin)}
      </span>
    </TableCell>
  );
}
