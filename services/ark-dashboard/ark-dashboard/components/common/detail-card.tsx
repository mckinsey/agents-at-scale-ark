import type { ReactNode } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface DetailCardProps {
  readonly title: string;
  readonly children: ReactNode;
}

export function DetailCard({ title, children }: Readonly<DetailCardProps>) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-fill-onsurface-ui-1 flex items-center p-2">
        <p className="label-regular-primary text-fg-primary">{title}</p>
      </div>
      <div className="border-stroke-divider flex flex-1 flex-col border-r border-b border-l px-2">
        {children}
      </div>
    </div>
  );
}

interface DetailRowProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly last?: boolean;
  readonly valueClassName?: string;
  /** Help text shown on hover/focus of the label; omit to render a plain label. */
  readonly tooltip?: string;
}

export function DetailRow({
  label,
  value,
  last = false,
  valueClassName,
  tooltip,
}: Readonly<DetailRowProps>) {
  const labelClassName =
    'label-regular-primary text-fg-secondary w-[140px] shrink-0';

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-2',
        !last && 'border-stroke-divider border-b',
      )}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger className={cn(labelClassName, 'cursor-help text-left')}>
            {label}
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <span className={labelClassName}>{label}</span>
      )}
      <span
        className={cn(
          'label-regular-primary text-fg-primary min-w-0 flex-1',
          valueClassName ?? 'truncate',
        )}
        title={typeof value === 'string' ? value : undefined}>
        {value}
      </span>
    </div>
  );
}

interface DetailSectionCardProps {
  readonly title: string;
  readonly headerRight?: ReactNode;
  readonly children: ReactNode;
}

export function DetailSectionCard({
  title,
  headerRight,
  children,
}: Readonly<DetailSectionCardProps>) {
  return (
    <div className="flex flex-col">
      <div className="bg-fill-onsurface-ui-1 flex items-center gap-2 p-2">
        <p className="label-regular-primary text-fg-primary flex-1">{title}</p>
        {headerRight}
      </div>
      <div className="border-stroke-divider border-r border-b border-l px-2">
        {children}
      </div>
    </div>
  );
}
