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

interface BrokerFallbackNoticeProps {
  onDismiss: () => void;
}

export function BrokerFallbackNotice({
  onDismiss,
}: Readonly<BrokerFallbackNoticeProps>) {
  return (
    <Alert layout="long" data-testid="broker-fallback-notice">
      <AlertIcon className="text-status-warning">
        <Warning />
      </AlertIcon>
      <AlertContent>
        <AlertTitle>Streaming chat is unavailable</AlertTitle>
        <AlertDescription>Using polling instead.</AlertDescription>
      </AlertContent>
      <AlertClose
        onClick={onDismiss}
        aria-label="Dismiss"
        data-testid="broker-fallback-notice-dismiss"
      />
    </Alert>
  );
}
