'use client';

import { ErrorIcon, Warning } from '@/components/icons';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
} from '@/components/ui/alert';
import { IconShell } from '@/components/ui/icon-shell';

export function InstallNotice({
  tone,
  message,
}: Readonly<{ tone: 'error' | 'warning'; message: string }>) {
  const isError = tone === 'error';

  return (
    <Alert
      layout="long"
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className="items-start gap-2 p-3 shadow-none">
      <AlertIcon
        className={`size-5 ${
          isError ? 'text-status-error' : 'text-status-warning'
        }`}>
        <IconShell size="sm">{isError ? <ErrorIcon /> : <Warning />}</IconShell>
      </AlertIcon>
      <AlertContent className="gap-0 pt-0 first:pl-0">
        <AlertDescription className="paragraph-small-primary">
          {message}
        </AlertDescription>
      </AlertContent>
    </Alert>
  );
}
