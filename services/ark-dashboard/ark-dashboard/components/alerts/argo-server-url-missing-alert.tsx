'use client';

import { Warning } from '@/components/icons';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { useGetSystemInfo } from '@/lib/services/system-info-hooks';

export function ArgoServerUrlMissingAlert() {
  const { data: systemInfo } = useGetSystemInfo();

  if (systemInfo?.argo_server_configured !== false) {
    return null;
  }

  return (
    <Alert layout="long" data-testid="argo-server-url-missing-alert">
      <AlertIcon className="text-status-warning">
        <Warning />
      </AlertIcon>
      <AlertContent>
        <AlertTitle>Workflow runs are not sorted by start time</AlertTitle>
        <AlertDescription>
          ARGO_SERVER_URL is not set in the ark-api environment, so runs are
          listed from the Kubernetes API. Set it to the Argo Server address, for
          example http://argo-workflows-server:2746.
        </AlertDescription>
      </AlertContent>
    </Alert>
  );
}
