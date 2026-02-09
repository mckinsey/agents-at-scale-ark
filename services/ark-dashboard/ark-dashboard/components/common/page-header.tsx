'use client';

import type { ReactNode } from 'react';

type PageHeaderProps = {
  actions?: ReactNode;
};

export function PageHeader({ actions }: PageHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 px-4">
      <div className="ml-auto flex items-center space-x-2">
        {actions && actions}
      </div>
    </header>
  );
}
