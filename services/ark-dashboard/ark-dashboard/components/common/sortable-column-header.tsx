import { SwapVert } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import type { SortDirection } from '@/lib/hooks/use-value-sort';
import { cn } from '@/lib/utils';

type OrderLabels = Readonly<Record<SortDirection, string>>;

const DATE_ORDER_LABELS: OrderLabels = {
  desc: 'newest first',
  asc: 'oldest first',
};

interface SortableColumnHeaderProps {
  readonly label: string;
  readonly sortDirection: SortDirection;
  readonly onToggle: () => void;
  readonly className?: string;
  readonly orderLabels?: OrderLabels;
}

export function SortableColumnHeader({
  label,
  sortDirection,
  onToggle,
  className,
  orderLabels = DATE_ORDER_LABELS,
}: Readonly<SortableColumnHeaderProps>) {
  const order = orderLabels[sortDirection];

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Sort by ${label.toLowerCase()}, currently ${order}`}
      className={cn(
        'focus-visible:ring-stroke-status-focus flex cursor-pointer items-center gap-1 text-left outline-none focus-visible:ring-1',
        className,
      )}>
      {label}
      <IconShell size="sm" variant="secondary">
        <SwapVert />
      </IconShell>
    </button>
  );
}
