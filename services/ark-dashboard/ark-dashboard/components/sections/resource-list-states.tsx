import type { ReactNode } from 'react';

import { Search } from '@/components/icons';
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
            <p className="text-fg-primary text-xl leading-7">{title}</p>
            <div className="text-fg-secondary text-center text-base leading-6 tracking-[-0.128px]">
              {description}
            </div>
          </div>
          <div className="flex items-start gap-3">{actions}</div>
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
      <p className="text-fg-secondary text-base leading-6 tracking-[-0.128px]">
        {message}
      </p>
    </div>
  );
}
