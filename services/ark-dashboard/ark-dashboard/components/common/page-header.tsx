'use client';

import { Info } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Fragment } from 'react';

import { NamespacedLink } from '@/components/namespaced-link';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export type BreadcrumbElement = {
  label: string;
  href: ComponentProps<typeof NamespacedLink>['href'];
};

type BreadcrumbsDropdownProps = {
  elements: BreadcrumbElement[];
};

function BreadcrumbsDropdown({ elements }: BreadcrumbsDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1">
        <BreadcrumbEllipsis className="size-4" />
        <span className="sr-only">Toggle menu</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {elements.map(e => (
          <NamespacedLink href={e.href} key={e.label}>
            <DropdownMenuItem>{e.label}</DropdownMenuItem>
          </NamespacedLink>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type BreadcrumbsLinksProps = {
  elements?: BreadcrumbElement[];
};

function BreadcrumbsLinks({ elements }: BreadcrumbsLinksProps) {
  return (
    <>
      {elements?.map(link => (
        <Fragment key={link.label}>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <NamespacedLink href={link.href}>{link.label}</NamespacedLink>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
        </Fragment>
      ))}
    </>
  );
}

function HeaderTooltip() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" asChild>
          <a
            href="https://mckinsey.github.io/agents-at-scale-ark/"
            target="_blank">
            <Info className="h-4 w-4" />
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span>Help</span>
      </TooltipContent>
    </Tooltip>
  );
}

type PageHeaderProps = {
  breadcrumbs?: BreadcrumbElement[];
  currentPage?: string;
  actions?: ReactNode;
  hideSidebarTrigger?: boolean;
  customBreadcrumb?: ReactNode;
  className?: string;
};

export function PageHeader({
  breadcrumbs,
  currentPage,
  actions,
  hideSidebarTrigger,
  customBreadcrumb,
  className,
}: PageHeaderProps) {
  const firstCrumb =
    (breadcrumbs?.length || 0) > 2 ? breadcrumbs?.[0] : undefined;
  const crumbsInDropdown =
    (breadcrumbs?.length || 0) > 2 ? breadcrumbs?.slice(1, -1) : undefined;
  const visibleCrumbs =
    (breadcrumbs?.length || 0) > 2 ? breadcrumbs?.slice(-1) : breadcrumbs;

  return (
    <header
      className={cn(
        'flex h-16 shrink-0 items-center gap-2 px-4',
        className,
      )}>
      {!hideSidebarTrigger && (
        <>
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
        </>
      )}
      {customBreadcrumb}
      {/* Mobile */}
      {!customBreadcrumb && currentPage && (
        <Breadcrumb className="block md:hidden">
          <BreadcrumbList>
            {breadcrumbs?.length ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbsDropdown elements={breadcrumbs} />
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            ) : null}
            <BreadcrumbItem>
              <BreadcrumbPage>{currentPage}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      )}
      {/* Desktop */}
      {!customBreadcrumb && currentPage && (
        <Breadcrumb className="hidden md:block">
          <BreadcrumbList>
            {firstCrumb && (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <NamespacedLink href={firstCrumb.href}>{firstCrumb.label}</NamespacedLink>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            )}
            {crumbsInDropdown ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbsDropdown elements={crumbsInDropdown} />
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </>
            ) : null}
            <BreadcrumbsLinks elements={visibleCrumbs} />
            <BreadcrumbItem>
              <BreadcrumbPage>{currentPage}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="ml-auto flex items-center space-x-2">
        {actions && actions}
        <HeaderTooltip />
      </div>
    </header>
  );
}
