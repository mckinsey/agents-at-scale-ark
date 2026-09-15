import { Info } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import { TableCell, TableHead } from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { getOriginLabel } from '@/lib/utils/origin-icon';

const ORIGIN_COL = 'w-[80px]';

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
  const label = getOriginLabel(origin);
  return (
    <TableCell size="small" className={ORIGIN_COL}>
      <TruncatedTooltip label={label}>
        <span className="text-fg-primary block w-full truncate">{label}</span>
      </TruncatedTooltip>
    </TableCell>
  );
}
