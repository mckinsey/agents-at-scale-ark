'use client';

import copy from 'copy-to-clipboard';
import { useEffect, useRef, useState } from 'react';

import { Check, ContentCopy } from '@/components/icons';
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { type APIKeyCreateResponse } from '@/lib/services';

const COPY_RESET_MS = 2000;

type CopyTarget = 'public' | 'secret' | 'both';

interface APIKeyCreatedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: APIKeyCreateResponse;
}

interface CredentialFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly copied: boolean;
  readonly onCopy: () => void;
}

function CredentialField({
  id,
  label,
  value,
  copied,
  onCopy,
}: Readonly<CredentialFieldProps>) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="label-regular-primary text-fg-secondary">
        {label}
      </Label>
      <InputGroup variant="inline" size="default">
        <InputGroupInput
          id={id}
          variant="inline"
          size="default"
          value={value}
          readOnly
          onClick={event => event.currentTarget.select()}
          className="cursor-pointer"
        />
        <InputGroupAddon align="inline-end">
          <button
            type="button"
            onClick={onCopy}
            aria-label={copied ? `${label} copied` : `Copy ${label}`}
            className="focus-visible:ring-stroke-status-focus flex size-5 cursor-pointer items-center justify-center outline-none focus-visible:ring-1">
            <IconShell size="sm">
              {copied ? <Check /> : <ContentCopy />}
            </IconShell>
          </button>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

export function APIKeyCreatedDialog({
  open,
  onOpenChange,
  apiKey,
}: APIKeyCreatedDialogProps) {
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResetTimer = () => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  };

  useEffect(() => clearResetTimer, []);

  const copyToClipboard = (text: string, target: CopyTarget) => {
    copy(text);
    setCopiedTarget(target);
    // One shared marker, so an earlier timer must not clear a later tick.
    clearResetTimer();
    resetTimer.current = setTimeout(() => setCopiedTarget(null), COPY_RESET_MS);
  };

  const handleClose = () => {
    clearResetTimer();
    setCopiedTarget(null);
    onOpenChange(false);
  };

  const bothCredentials = `Public Key: ${apiKey.public_key}\nSecret Key: ${apiKey.secret_key}`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[586px]">
        <DialogHeader>
          <DialogTitle>API Key Created Successfully</DialogTitle>
          <DialogDescription>
            The secret key will only be shown once. Save it securely now.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <CredentialField
            id="public-key"
            label="Public Key"
            value={apiKey.public_key}
            copied={copiedTarget === 'public'}
            onCopy={() => copyToClipboard(apiKey.public_key, 'public')}
          />
          <CredentialField
            id="secret-key"
            label="Secret Key"
            value={apiKey.secret_key}
            copied={copiedTarget === 'secret'}
            onCopy={() => copyToClipboard(apiKey.secret_key, 'secret')}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => copyToClipboard(bothCredentials, 'both')}>
            {copiedTarget === 'both' ? 'Copied' : 'Copy both'}
          </Button>
          <Button onClick={handleClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
