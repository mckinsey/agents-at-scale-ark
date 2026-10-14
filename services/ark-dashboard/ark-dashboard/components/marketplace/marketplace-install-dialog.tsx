'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { SaveAlt } from '@/components/icons';
import { InstallNotice } from '@/components/marketplace/install-notice';
import { InstallResourceTable } from '@/components/marketplace/install-resource-table';
import { InstallStageList } from '@/components/marketplace/install-stage-list';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { MarketplaceItem } from '@/lib/api/generated/marketplace-types';
import {
  useMarketplaceInstallState,
  useNamespaceInstallLock,
} from '@/lib/hooks/use-marketplace-install-state';
import {
  INSTALL_TIMEOUT_MS,
  createPendingStages,
  deriveStages,
  getInstallPreview,
  getInstallStageLabel,
  startInstall,
} from '@/lib/services/marketplace-install-mock';
import {
  countBlockingResources,
  countUnverifiableResources,
} from '@/lib/services/marketplace-install-types';
import type { MarketplaceInstallPreview } from '@/lib/services/marketplace-install-types';
import { useNamespace } from '@/providers/NamespaceProvider';

type InstallPhase = 'preview' | 'installing' | 'done' | 'failed';

interface MarketplaceInstallDialogProps {
  readonly item: MarketplaceItem;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function PreviewSummary({
  preview,
}: Readonly<{ preview: MarketplaceInstallPreview }>) {
  const rows: [string, string][] = [
    ['Chart', preview.chartName],
    ['Version', preview.chartVersion],
    ['Release', preview.releaseName],
    ['Namespace', preview.namespace],
  ];

  return (
    <dl className="border-stroke-divider grid grid-cols-2 gap-x-6 gap-y-3 border-b px-3 pb-5 sm:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-1">
          <dt className="label-small-primary text-fg-secondary">{label}</dt>
          <dd className="paragraph-small-primary text-fg-primary truncate">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PreviewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <output className="sr-only">Loading installation preview</output>
      <Skeleton className="h-14 w-full" />
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}

export function MarketplaceInstallDialog({
  item,
  open,
  onOpenChange,
}: Readonly<MarketplaceInstallDialogProps>) {
  const { namespace, readOnlyMode } = useNamespace();
  const { state, record, stages, setRecord } = useMarketplaceInstallState(item);
  const lock = useNamespaceInstallLock();
  const [preview, setPreview] = useState<MarketplaceInstallPreview | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const itemRef = useRef(item);
  itemRef.current = item;

  // The record is the source of truth, so progress survives closing the modal,
  // navigating away, and a reload.
  const phase: InstallPhase =
    state === 'installing'
      ? 'installing'
      : state === 'installed' && record
        ? 'done'
        : state === 'failed' || state === 'timed-out'
          ? 'failed'
          : 'preview';

  const lockedByOther = Boolean(lock && lock.itemId !== item.id);

  useEffect(() => {
    if (!open || phase !== 'preview') {
      return;
    }

    setPreview(null);
    setPreviewError(null);

    let cancelled = false;
    getInstallPreview(namespace, itemRef.current)
      .then(result => {
        if (!cancelled) {
          setPreview(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewError('Could not load the installation preview.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, namespace, item.id, phase]);

  const handleInstall = useCallback(() => {
    if (readOnlyMode || lockedByOther || !preview) {
      return;
    }
    setRecord(startInstall(itemRef.current, preview.resources));
  }, [readOnlyMode, lockedByOther, preview, setRecord]);

  const blockingCount = preview ? countBlockingResources(preview.resources) : 0;
  const unverifiableCount = preview
    ? countUnverifiableResources(preview.resources)
    : 0;
  const blocked = blockingCount > 0;

  const failedStage = record?.failedStage;
  const installedResources = record?.resources ?? preview?.resources ?? [];
  // A terminal record must render the stages as they stood when it ended — a
  // timed-out install has NOT completed every stage.
  const shownStages =
    stages ??
    (state === 'timed-out'
      ? deriveStages(item.id, INSTALL_TIMEOUT_MS)
      : failedStage
        ? deriveStages(item.id, Number.POSITIVE_INFINITY)
        : createPendingStages());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {phase === 'done'
              ? `${item.name} installed`
              : `Install ${item.name}`}
          </DialogTitle>
          <DialogDescription>
            {phase === 'preview' &&
              (blocked
                ? 'This install cannot proceed as-is.'
                : 'These resources will be created in your namespace.')}
            {phase === 'installing' &&
              'Installing. You can close this — it keeps running.'}
            {phase === 'done' && 'The following resources were created.'}
            {phase === 'failed' && 'The installation did not complete.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[22rem] pr-4">
          {phase === 'preview' && (
            <div className="flex flex-col gap-6">
              {previewError ? (
                <InstallNotice tone="error" message={previewError} />
              ) : null}
              {!preview && !previewError ? <PreviewSkeleton /> : null}
              {preview ? (
                <>
                  <PreviewSummary preview={preview} />
                  {blocked ? (
                    <InstallNotice
                      tone="error"
                      message={
                        blockingCount === 1
                          ? '1 resource already exists in this namespace, manually delete it to enable this install, or contact the platform team.'
                          : `${blockingCount} resources already exist in this namespace, manually delete them to enable this install, or contact the platform team.`
                      }
                    />
                  ) : null}
                  {!blocked && lockedByOther && lock ? (
                    <InstallNotice
                      tone="warning"
                      message={`Installing ${lock.itemName}. One install runs at a time in a namespace, so this can start once that finishes.`}
                    />
                  ) : null}
                  {!blocked && !lockedByOther && unverifiableCount > 0 ? (
                    <InstallNotice
                      tone="warning"
                      message="Some resources could not be checked — you do not have permission to read them, so conflicts cannot be ruled out."
                    />
                  ) : null}
                  <InstallResourceTable
                    resources={preview.resources}
                    showLinks={false}
                  />
                </>
              ) : null}
            </div>
          )}

          {phase === 'installing' && <InstallStageList stages={shownStages} />}

          {phase === 'done' && (
            <InstallResourceTable resources={installedResources} showLinks />
          )}

          {phase === 'failed' && (
            <div className="flex flex-col gap-6">
              <InstallStageList stages={shownStages} />
              <InstallNotice
                tone="error"
                message={
                  failedStage
                    ? `Installation failed while ${getInstallStageLabel(failedStage).toLowerCase()}. Contact the platform team.`
                    : 'Installation failed. Contact the platform team.'
                }
              />
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          {phase === 'preview' && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleInstall}
                disabled={!preview || blocked || lockedByOther || readOnlyMode}>
                <IconShell size="sm">
                  <SaveAlt />
                </IconShell>
                Install
              </Button>
            </>
          )}
          {phase === 'installing' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
          {(phase === 'done' || phase === 'failed') && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
