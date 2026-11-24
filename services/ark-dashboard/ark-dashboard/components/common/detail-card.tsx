import type { ReactNode } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { cn } from '@/lib/utils';

interface DetailCardProps {
  readonly title: string;
  readonly children: ReactNode;
}

export function DetailCard({ title, children }: Readonly<DetailCardProps>) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="bg-fill-onsurface-ui-2 flex items-center p-2">
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
    'paragraph-regular-primary text-fg-primary w-[140px] shrink-0';
  const valueBaseClassName =
    'paragraph-regular-primary text-fg-primary min-w-0 flex-1';

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-2',
        !last && 'border-stroke-divider border-b',
      )}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger
            tabIndex={-1}
            className={cn(labelClassName, 'cursor-help text-left')}>
            {label}
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <span className={labelClassName}>{label}</span>
      )}
      {typeof value === 'string' && valueClassName === undefined ? (
        <TruncatedTooltip
          label={value}
          contentClassName="max-w-[420px] [overflow-wrap:anywhere]">
          <span className={cn(valueBaseClassName, 'truncate')}>{value}</span>
        </TruncatedTooltip>
      ) : (
        <span className={cn(valueBaseClassName, valueClassName ?? 'truncate')}>
          {value}
        </span>
      )}
    </div>
  );
}

interface DetailSectionCardProps {
  readonly title: string;
  readonly headerRight?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly bodyClassName?: string;
}

export function DetailSectionCard({
  title,
  headerRight,
  children,
  className,
  bodyClassName,
}: Readonly<DetailSectionCardProps>) {
  return (
    <div className={cn('flex flex-col', className)}>
      <div className="bg-fill-onsurface-ui-2 flex items-center gap-2 p-2">
        <p className="label-regular-primary text-fg-primary flex-1">{title}</p>
        {headerRight}
      </div>
      <div
        className={cn(
          'border-stroke-divider border-r border-b border-l px-2',
          bodyClassName,
        )}>
        {children}
      </div>
    </div>
  );
}
