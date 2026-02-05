'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';


export type BreadcrumbElement = {
  label: string;
  href: ComponentProps<typeof Link>['href'];
};




type PageHeaderProps = {
  breadcrumbs?: BreadcrumbElement[];
  currentPage: string;
  actions?: ReactNode;
};

export function PageHeader({
  breadcrumbs,
  currentPage,
  actions,
}: PageHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 px-4">
      <div className="ml-auto flex items-center space-x-2">
        {actions && actions}
      </div>
    </header>
  );
}
