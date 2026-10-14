'use client';

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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  INSTALL_TIMEOUT_MS,
  deriveStages,
  getInstallStageLabel,
} from '@/lib/services/marketplace-install-mock';
import type { InstallRecord } from '@/lib/services/marketplace-install-types';

interface InstallResultDialogProps {
  readonly itemId: string;
  readonly record: InstallRecord;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * The outcome of a finished install, openable from the sidebar on any page —
 * the per-card dialog only exists on /marketplace.
 */
export function InstallResultDialog({
  itemId,
  record,
  open,
  onOpenChange,
}: Readonly<InstallResultDialogProps>) {
  const succeeded = record.state === 'installed';
  const timedOut = record.state === 'timed-out';

  const stages = timedOut
    ? deriveStages(itemId, INSTALL_TIMEOUT_MS)
    : deriveStages(itemId, Number.POSITIVE_INFINITY);

  let failureMessage: string;
  if (timedOut) {
    failureMessage =
      'The install did not finish in time, so it was stopped. Contact the platform team.';
  } else if (record.failedStage) {
    failureMessage = `Installation failed while ${getInstallStageLabel(
      record.failedStage,
    ).toLowerCase()}. Contact the platform team.`;
  } else {
    failureMessage = 'Installation failed. Contact the platform team.';
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {succeeded
              ? `${record.itemName} installed`
              : `Install ${record.itemName}`}
          </DialogTitle>
          <DialogDescription>
            {succeeded
              ? 'The following resources were created.'
              : 'The installation did not complete.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[22rem] pr-4">
          {succeeded ? (
            <InstallResourceTable
              resources={record.resources ?? []}
              showLinks
            />
          ) : (
            <div className="flex flex-col gap-6">
              <InstallStageList stages={stages} />
              <InstallNotice tone="error" message={failureMessage} />
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
