'use client';

import copy from 'copy-to-clipboard';
import { format, isValid } from 'date-fns';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Check, ContentCopy } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { toast } from '@/components/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  rowHoverOverlayClass,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import { type APIKey } from '@/lib/services';

const TIMESTAMP_FORMAT = 'dd/MM/yyyy, HH:mm:ss';
const COPY_RESET_MS = 2000;

const COLUMN_WIDTHS = {
  publicKey: 'w-[220px]',
  created: 'w-[160px]',
  lastUsed: 'w-[160px]',
  expires: 'w-[160px]',
  actions: 'w-[80px]',
} as const;

/** 'Never' means the event has not happened; '—' means the value was unusable. */
function formatApiKeyTimestamp(value: string | null | undefined): string {
  if (!value) {
    return 'Never';
  }
  const date = new Date(value);
  return isValid(date) ? format(date, TIMESTAMP_FORMAT) : '—';
}

interface APIKeysTableProps {
  readonly data: APIKey[];
  readonly onRevoke: (apiKey: APIKey) => void;
}

interface APIKeyRowProps {
  readonly apiKey: APIKey;
  readonly copied: boolean;
  readonly onCopy: (apiKey: APIKey) => void;
  readonly onRevoke: (apiKey: APIKey) => void;
}

function APIKeyRow({
  apiKey,
  copied,
  onCopy,
  onRevoke,
}: Readonly<APIKeyRowProps>) {
  return (
    <TableRow className="relative isolate">
      <TableCell size="small">
        <span aria-hidden className={rowHoverOverlayClass} />
        <TruncatedTooltip label={apiKey.name}>
          <span className="block truncate">{apiKey.name}</span>
        </TruncatedTooltip>
      </TableCell>

      <TableCell size="small" className={COLUMN_WIDTHS.publicKey}>
        <div className="flex items-center gap-2">
          <TruncatedTooltip label={apiKey.public_key}>
            <span className="block min-w-0 flex-1 truncate">
              {apiKey.public_key}
            </span>
          </TruncatedTooltip>
          <IconActionButton
            label={
              copied
                ? 'Public key copied'
                : `Copy public key for ${apiKey.name}`
            }
            tooltip={copied ? 'Copied' : 'Copy public key'}
            onClick={() => onCopy(apiKey)}
            className="shrink-0">
            {copied ? <Check /> : <ContentCopy />}
          </IconActionButton>
        </div>
      </TableCell>

      <TableCell size="small" className={COLUMN_WIDTHS.created}>
        {formatApiKeyTimestamp(apiKey.created_at)}
      </TableCell>

      <TableCell size="small" className={COLUMN_WIDTHS.lastUsed}>
        {formatApiKeyTimestamp(apiKey.last_used_at)}
      </TableCell>

      <TableCell size="small" className={COLUMN_WIDTHS.expires}>
        {formatApiKeyTimestamp(apiKey.expires_at)}
      </TableCell>

      <TableCell size="small" className={COLUMN_WIDTHS.actions}>
        <div className="flex items-center justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="xs"
                onClick={() => onRevoke(apiKey)}>
                Revoke
              </Button>
            </TooltipTrigger>
            <TooltipContent>Revoke and invalidate</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function APIKeysTable({ data, onRevoke }: Readonly<APIKeysTableProps>) {
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    },
    [],
  );

  const handleCopy = useCallback((apiKey: APIKey) => {
    if (!copy(apiKey.public_key)) {
      toast.error('Failed to copy public key');
      return;
    }
    setCopiedKeyId(apiKey.id);
    // One shared marker, so an earlier timer must not clear a later tick.
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
    }
    resetTimer.current = setTimeout(() => setCopiedKeyId(null), COPY_RESET_MS);
  }, []);

  return (
    <Table className="table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small">Name</TableHead>
          <TableHead size="small" className={COLUMN_WIDTHS.publicKey}>
            Public Key
          </TableHead>
          <TableHead size="small" className={COLUMN_WIDTHS.created}>
            Created
          </TableHead>
          <TableHead size="small" className={COLUMN_WIDTHS.lastUsed}>
            Last used
          </TableHead>
          <TableHead size="small" className={COLUMN_WIDTHS.expires}>
            Expires
          </TableHead>
          <TableHead size="small" className={COLUMN_WIDTHS.actions}>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map(apiKey => (
          <APIKeyRow
            key={apiKey.id}
            apiKey={apiKey}
            copied={copiedKeyId === apiKey.id}
            onCopy={handleCopy}
            onRevoke={onRevoke}
          />
        ))}
      </TableBody>
    </Table>
  );
}
