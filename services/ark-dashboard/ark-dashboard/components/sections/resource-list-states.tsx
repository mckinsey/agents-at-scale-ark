import type { ReactNode } from 'react';

import { Search, Warning } from '@/components/icons';
import { Button, wrapTextNodes } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface LearnMoreButtonProps {
  readonly href: string;
  readonly label?: string;
}

export function LearnMoreButton({
  href,
  label = 'Learn more',
}: Readonly<LearnMoreButtonProps>) {
  return (
    <Button asChild variant="outline">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {wrapTextNodes(label)}
      </a>
    </Button>
  );
}

interface ResourceSearchInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly className?: string;
}

export function ResourceSearchInput({
  value,
  onChange,
  placeholder = 'Search',
  className,
}: ResourceSearchInputProps) {
  return (
    <div className={cn('relative w-[304px] max-w-full', className)}>
      <span className="text-fg-tertiary pointer-events-none absolute top-1/2 left-2 -translate-y-1/2">
        <IconShell size="sm" variant="secondary">
          <Search />
        </IconShell>
      </span>
      <Input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}

interface ResourceEmptyStateProps {
  /** Raw icon glyph; wrapped in IconShell internally. */
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: ReactNode;
  /** Action buttons rendered in the footer row. */
  readonly actions: ReactNode;
}

export function ResourceEmptyState({
  icon,
  title,
  description,
  actions,
}: ResourceEmptyStateProps) {
  return (
    <div className="mt-5 flex-1">
      <div className="bg-surface-primary flex flex-col items-center justify-center py-12">
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-3">
            <div className="bg-surface-secondary flex items-center p-3">
              <IconShell size="default" variant="secondary">
                {icon}
              </IconShell>
            </div>
            <p className="headings-h3-regular text-fg-primary">{title}</p>
            <div className="label-large-primary text-fg-secondary text-center">
              {description}
            </div>
          </div>
          <div className="flex items-start gap-3 [&>*]:min-w-[100px] [&_button]:min-w-[100px]">
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ResourceNoResultsProps {
  /** Raw icon glyph; wrapped in IconShell internally. */
  readonly icon: ReactNode;
  readonly message: string;
}

export function ResourceNoResults({ icon, message }: ResourceNoResultsProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
      <div className="bg-surface-secondary flex items-center p-3">
        <IconShell size="default" variant="secondary">
          {icon}
        </IconShell>
      </div>
      <p className="label-large-primary text-fg-secondary">{message}</p>
    </div>
  );
}

interface ResourceErrorStateProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly className?: string;
}

export function ResourceErrorState({
  title,
  description,
  className,
}: Readonly<ResourceErrorStateProps>) {
  return (
    <div
      role="alert"
      className={cn(
        'border-status-error/30 bg-status-error/10 flex flex-none items-start gap-2 border px-3 py-2',
        className,
      )}>
      <IconShell size="sm" className="text-fg-error mt-0.5 shrink-0">
        <Warning />
      </IconShell>
      <div>
        <p className="label-regular-primary text-fg-error">{title}</p>
        {description ? (
          <p className="paragraph-regular-primary text-fg-secondary mt-1">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
