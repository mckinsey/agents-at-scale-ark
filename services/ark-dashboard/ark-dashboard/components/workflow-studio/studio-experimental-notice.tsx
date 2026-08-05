'use client';

import { Close, Warning } from '@/components/icons';

export interface StudioExperimentalNoticeProps {
  onDismiss: () => void;
}

export function StudioExperimentalNotice({
  onDismiss,
}: Readonly<StudioExperimentalNoticeProps>) {
  return (
    <div
      className="bg-fill-muted/40 border-stroke-divider relative border p-2"
      data-testid="studio-experimental-notice">
      <div className="text-fg-secondary flex min-h-[48px] items-center justify-center gap-2 px-6 text-sm">
        <Warning className="text-status-warning h-4 w-4 shrink-0" />
        <span>
          Argo Make is experimental. Use with caution and review generated
          workflows before running them.
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss experimental notice"
        data-testid="studio-experimental-notice-dismiss"
        className="text-fg-secondary hover:text-fg-primary absolute top-2 right-2">
        <Close className="h-4 w-4" />
      </button>
    </div>
  );
}
