'use client';

import { Warning } from '@/components/icons';

export interface StudioExperimentalNoticeProps {
  onDismiss: () => void;
}

export function StudioExperimentalNotice({
  onDismiss,
}: Readonly<StudioExperimentalNoticeProps>) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Dismiss experimental notice"
      data-testid="studio-experimental-notice"
      className="bg-fill-muted/40 border-stroke-divider hover:bg-fill-muted/60 w-full cursor-pointer border p-2 text-left">
      <div className="text-fg-secondary flex min-h-[48px] items-center justify-center gap-2 text-sm">
        <Warning className="text-status-warning h-4 w-4 shrink-0" />
        Argo Make is experimental. Click to dismiss and start chatting.
      </div>
    </button>
  );
}
