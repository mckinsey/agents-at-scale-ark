import { Info } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { IconShell } from '@/components/ui/icon-shell';
import { TableCell, TableHead } from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import {
  A2A_SERVER_ORIGIN_LABEL,
  getOriginLabel,
} from '@/lib/utils/origin-icon';

const ORIGIN_COL = 'w-[140px]';

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
  readonly a2aServerName?: string | null;
  readonly rowHref?: string;
}

export function OriginCell({
  origin,
  a2aServerName,
  rowHref,
}: Readonly<OriginCellProps>) {
  if (a2aServerName) {
    const labelClassName = 'text-fg-primary block w-fit max-w-full truncate';
    return (
      <TableCell size="small" className={`${ORIGIN_COL} relative z-10`}>
        <Tooltip>
          <TooltipTrigger asChild>
            {rowHref ? (
              <NamespacedLink
                href={rowHref}
                tabIndex={-1}
                className={labelClassName}>
                {A2A_SERVER_ORIGIN_LABEL}
              </NamespacedLink>
            ) : (
              <span className={labelClassName}>{A2A_SERVER_ORIGIN_LABEL}</span>
            )}
          </TooltipTrigger>
          <TooltipContent>{`A2A server: ${a2aServerName}`}</TooltipContent>
        </Tooltip>
      </TableCell>
    );
  }

  const label = getOriginLabel(origin);
  return (
    <TableCell size="small" className={ORIGIN_COL}>
      <TruncatedTooltip label={label}>
        <span className="text-fg-primary block w-full truncate">{label}</span>
      </TruncatedTooltip>
    </TableCell>
  );
}
