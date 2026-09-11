'use client';

import { Trash } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useDeleteMarketplaceSource,
  useMarketplaceCanEdit,
  useMarketplaceSources,
} from '@/lib/services/marketplace-hooks';

const SKELETON_ROWS = ['first', 'second', 'third'];

function MarketplaceSourcesSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex max-w-[600px] flex-col gap-2">
      <span className="sr-only">Loading marketplace sources…</span>
      <Skeleton className="h-6 w-[200px]" />
      <div aria-hidden className="flex flex-col gap-3">
        {SKELETON_ROWS.map(row => (
          <div
            key={row}
            className="border-stroke-divider flex flex-col gap-1 border p-3">
            <Skeleton className="h-5 w-[160px]" />
            <Skeleton className="h-5 w-[140px]" />
            <Skeleton className="h-5 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ManageMarketplaceSettings() {
  const { data: sources, isPending } = useMarketplaceSources();
  const { data: permissions } = useMarketplaceCanEdit();
  const deleteSource = useDeleteMarketplaceSource();

  const canEdit = permissions?.canEdit ?? false;

  if (isPending) {
    return <MarketplaceSourcesSkeleton />;
  }

  const hasSources = Boolean(sources && sources.length > 0);

  return (
    <div className="flex max-w-[600px] flex-col gap-2">
      <h2 className="headings-h3-regular text-fg-primary">
        Marketplace sources
      </h2>

      {hasSources ? (
        <div className="flex flex-col gap-3">
          {sources?.map(source => {
            const label = source.displayName || source.name;

            return (
              <div
                key={source.name}
                className="border-stroke-divider flex items-start gap-4 border p-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="paragraph-regular-primary text-fg-secondary">
                      {label}
                    </span>
                    {source.hasCredential && (
                      <Badge variant="alternative" size="sm">
                        {source.auth?.scheme === 'basic' ? 'Basic' : 'Bearer'}
                      </Badge>
                    )}
                  </div>
                  <p className="headings-h4-regular text-fg-primary">
                    Marketplace JSON URL
                  </p>
                  <p className="paragraph-regular-primary text-fg-secondary break-all">
                    {source.url}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${label}`}
                    onClick={() => deleteSource.mutate(source.name)}
                    disabled={deleteSource.isPending}>
                    <IconShell size="default" variant="secondary">
                      <Trash />
                    </IconShell>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="paragraph-regular-primary text-fg-secondary">
          No marketplace sources configured.
        </p>
      )}
    </div>
  );
}
