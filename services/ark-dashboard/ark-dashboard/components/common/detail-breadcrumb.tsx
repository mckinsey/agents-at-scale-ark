import { ChevronLeft } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { IconShell } from '@/components/ui/icon-shell';
import { cn } from '@/lib/utils';

interface DetailBreadcrumbProps {
  /** Route of the list this detail page belongs to. */
  readonly backHref: string;
  /** Label for the list, e.g. "A2A tasks". */
  readonly backLabel: string;
  /** Name of the record being viewed. */
  readonly current: string;
  readonly className?: string;
}

/**
 * Two-level breadcrumb for resource detail pages: a back link to the list,
 * then the current record.
 */
export function DetailBreadcrumb({
  backHref,
  backLabel,
  current,
  className,
}: Readonly<DetailBreadcrumbProps>) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        'flex items-center gap-1 text-sm leading-5 tracking-[-0.112px]',
        className,
      )}>
      <NamespacedLink
        href={backHref}
        className="text-fg-disabled hover:text-fg-secondary flex items-center gap-1 transition-colors">
        <IconShell size="sm" className="opacity-100">
          <ChevronLeft />
        </IconShell>
        {backLabel}
      </NamespacedLink>
      <span aria-hidden="true" className="text-fg-secondary">
        /
      </span>
      <span aria-current="page" className="text-fg-secondary">
        {current}
      </span>
    </nav>
  );
}
