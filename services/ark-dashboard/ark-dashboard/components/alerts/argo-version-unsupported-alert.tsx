'use client';

import { Warning } from '@/components/icons';
import {
  Alert,
  AlertClose,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { useGetSystemInfo } from '@/lib/services/system-info-hooks';
import { useArgoVersionNotice } from './use-argo-version-notice';

export function ArgoVersionUnsupportedAlert() {
  const { data: systemInfo } = useGetSystemInfo();
  const { dismissed, dismiss } = useArgoVersionNotice();

  if (dismissed || systemInfo?.argo_server_version_supported !== false) {
    return null;
  }

  return (
    <Alert layout="long" data-testid="argo-version-unsupported-alert">
      <AlertIcon className="text-status-warning">
        <Warning className="size-[25px]" />
      </AlertIcon>
      <AlertContent>
        <AlertTitle>Argo Workflows version is not supported</AlertTitle>
        <AlertDescription>
          The connected Argo Server is older than 4.1.0, so workflow template
          filtering relies on a slower fallback. Upgrade Argo Workflows to
          4.1.0 or later for full support.
        </AlertDescription>
      </AlertContent>
      <AlertClose
        onClick={dismiss}
        aria-label="Dismiss"
        data-testid="argo-version-unsupported-alert-dismiss"
      />
    </Alert>
  );
}
