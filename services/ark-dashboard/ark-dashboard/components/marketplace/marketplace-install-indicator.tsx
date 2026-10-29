'use client';

import { useState } from 'react';

import { Autorenew, CheckCircle, ErrorIcon } from '@/components/icons';
import { InstallResultDialog } from '@/components/marketplace/install-result-dialog';
import {
  InstallStageList,
  currentStageLabel,
} from '@/components/marketplace/install-stage-list';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useMarketplaceInstallCapability } from '@/lib/hooks/use-marketplace-install-capability';
import {
  useInstallClock,
  useInstallNotice,
} from '@/lib/hooks/use-marketplace-install-state';
import {
  deriveStages,
  elapsedSince,
} from '@/lib/services/marketplace-install-mock';
import type { InstallRecordState } from '@/lib/services/marketplace-install-types';

const STATE_LABEL: Readonly<Record<InstallRecordState, string>> = {
  installing: 'Installing',
  installed: 'Installed',
  failed: 'Install failed',
  'timed-out': 'Install timed out',
};

function NoticeIcon({ state }: Readonly<{ state: InstallRecordState }>) {
  if (state === 'installing') {
    return (
      <Autorenew className="h-4 w-4 animate-spin motion-reduce:animate-none" />
    );
  }

  if (state === 'installed') {
    return <CheckCircle className="text-status-success h-4 w-4" />;
  }

  return <ErrorIcon className="text-status-error h-4 w-4" />;
}

/**
 * A sidebar footer item above Settings. While an install runs it shows live
 * progress in a popover; once finished it stays put — so the outcome cannot be
 * missed — until the user opens the result, which is what retires it.
 */
export function MarketplaceInstallIndicator() {
  const installEnabled = useMarketplaceInstallCapability();
  const notice = useInstallNotice();
  const installing = notice?.record.state === 'installing';
  const now = useInstallClock(installing);
  const [resultOpen, setResultOpen] = useState(false);

  if (!installEnabled || !notice) {
    return null;
  }

  const { itemId, record, acknowledge } = notice;
  const label = `${STATE_LABEL[record.state]} ${record.itemName}`;

  if (!installing) {
    return (
      <>
        <SidebarMenuItem>
          <SidebarMenuButton
            aria-label={`${label}. Show result.`}
            tooltip={label}
            onClick={() => setResultOpen(true)}>
            <NoticeIcon state={record.state} />
            <span className="truncate">{label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <InstallResultDialog
          itemId={itemId}
          record={record}
          open={resultOpen}
          onOpenChange={next => {
            setResultOpen(next);
            if (!next) {
              // Retire the entry only once the user has actually seen it.
              acknowledge();
            }
          }}
        />
      </>
    );
  }

  const stages = deriveStages(itemId, elapsedSince(record.startedAt, now));

  return (
    <SidebarMenuItem>
      <Popover>
        <PopoverTrigger asChild>
          <SidebarMenuButton
            aria-label={`${label}. Show progress.`}
            tooltip={label}>
            <NoticeIcon state={record.state} />
            <span className="truncate">{label}</span>
          </SidebarMenuButton>
        </PopoverTrigger>
        <PopoverContent side="right" align="end" className="w-[22rem]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="label-regular-primary text-fg-primary">
                Installing {record.itemName}
              </p>
              <p className="paragraph-small-primary text-fg-secondary">
                {currentStageLabel(stages)}. This continues if you navigate
                away.
              </p>
            </div>
            <InstallStageList stages={stages} />
          </div>
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  );
}
