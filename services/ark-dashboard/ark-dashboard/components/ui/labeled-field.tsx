'use client';

import { cn } from '@/lib/utils';

export const COLUMN_LABEL_CLASS = 'text-fg-secondary label-small-primary';

export interface LabeledFieldProps {
  readonly id: string;
  readonly label: string;
  readonly className?: string;
  readonly children: React.ReactNode;
}

export function LabeledField({
  id,
  label,
  className,
  children,
}: LabeledFieldProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className={COLUMN_LABEL_CLASS}>
        {label}
      </label>
      {children}
    </div>
  );
}
