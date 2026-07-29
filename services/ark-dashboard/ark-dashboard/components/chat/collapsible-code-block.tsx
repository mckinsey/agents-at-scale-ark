'use client';

import { type ReactNode, useState } from 'react';

import { ChevronDown, ChevronRight } from '@/components/icons';
import { cn } from '@/lib/utils';

interface CollapsibleCodeBlockProps {
  language: string;
  className?: string;
  defaultCollapsed?: boolean;
  children: ReactNode;
}

export function CollapsibleCodeBlock({
  language,
  className,
  defaultCollapsed = false,
  children,
}: Readonly<CollapsibleCodeBlockProps>) {
  const [open, setOpen] = useState(!defaultCollapsed);

  return (
    <div className="bg-surface-bg-tertiary my-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        className="focus-visible:ring-stroke-status-focus text-fg-secondary hover:text-fg-primary flex w-full items-center gap-2 px-4 py-2 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-inset">
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <span>{language}</span>
      </button>
      <div className={cn(!open && 'hidden')}>
        <pre className="text-fg-primary overflow-x-auto p-4 text-sm">
          <code className={className}>{children}</code>
        </pre>
      </div>
    </div>
  );
}
