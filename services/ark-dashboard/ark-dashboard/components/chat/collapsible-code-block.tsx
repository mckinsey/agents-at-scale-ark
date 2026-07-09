'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';

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
    <div className="my-4 overflow-hidden rounded-md bg-gray-900 dark:bg-gray-800">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2 text-xs font-medium text-gray-300 hover:text-gray-100">
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <span>{language}</span>
      </button>
      <div className={cn(!open && 'hidden')}>
        <pre className="overflow-x-auto p-4 text-sm text-gray-100">
          <code className={className}>{children}</code>
        </pre>
      </div>
    </div>
  );
}
