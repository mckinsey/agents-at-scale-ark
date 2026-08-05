'use client';

import { Warning } from '@/components/icons';
import { Button } from '@/components/ui/button';

export interface StudioExperimentalNoticeProps {
  onDismiss: () => void;
}

export function StudioExperimentalNotice({
  onDismiss,
}: Readonly<StudioExperimentalNoticeProps>) {
  return (
    <div
      className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center p-6 backdrop-blur-sm"
      data-testid="studio-experimental-notice">
      <div className="border-stroke-divider flex w-full max-w-md flex-col items-center gap-3 border p-5 text-center">
        <Warning className="text-status-warning h-8 w-8 shrink-0" />
        <p className="text-fg-primary text-sm font-medium">
          Argo Make is experimental
        </p>
        <p className="text-fg-secondary text-sm">
          Use with caution and review generated workflows before running them.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDismiss}
          data-testid="studio-experimental-notice-dismiss">
          I understand
        </Button>
      </div>
    </div>
  );
}
