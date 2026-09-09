'use client';

import { Trash } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import {
  useDeleteMarketplaceSource,
  useMarketplaceCanEdit,
  useMarketplaceSources,
} from '@/lib/services/marketplace-hooks';

export function ManageMarketplaceSettings() {
  const { data: sources, isPending } = useMarketplaceSources();
  const { data: permissions } = useMarketplaceCanEdit();
  const deleteSource = useDeleteMarketplaceSource();

  const canEdit = permissions?.canEdit ?? false;

  if (isPending) {
    return (
      <p className="paragraph-regular-primary text-fg-secondary">
        Loading marketplace sources…
      </p>
    );
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
