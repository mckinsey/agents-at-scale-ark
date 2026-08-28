import { SwapVert } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import type { SortDirection } from '@/lib/hooks/use-value-sort';
import { cn } from '@/lib/utils';

interface SortableColumnHeaderProps {
  readonly label: string;
  readonly sortDirection: SortDirection;
  readonly onToggle: () => void;
  readonly className?: string;
}

export function SortableColumnHeader({
  label,
  sortDirection,
  onToggle,
  className,
}: Readonly<SortableColumnHeaderProps>) {
  const order = sortDirection === 'desc' ? 'newest first' : 'oldest first';

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
