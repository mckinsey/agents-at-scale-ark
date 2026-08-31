'use client';

import { format, isValid } from 'date-fns';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Check, ContentCopy } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
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

/** Figma column ratios: 0.75 / 0.75 / 0.5 / 0.5 / 0.5 / 0.25 of 3.25fr. */
const COLUMN_WIDTHS = {
  name: 'w-[23%]',
  publicKey: 'w-[23%]',
  created: 'w-[15.5%]',
  lastUsed: 'w-[15.5%]',
  expires: 'w-[15.5%]',
  actions: 'w-[7.5%]',
} as const;

/** 'Never' means the event has not happened; '—' means the value was unusable. */
function formatTimestamp(value: string | null | undefined): string {
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
      <TableCell size="small" className={COLUMN_WIDTHS.name}>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onCopy(apiKey)}
                aria-label={
                  copied
                    ? 'Public key copied'
                    : `Copy public key for ${apiKey.name}`
                }
                className="focus-visible:ring-stroke-status-focus flex size-4 shrink-0 cursor-pointer items-center justify-center outline-none focus-visible:ring-1">
                <IconShell size="sm" variant="secondary">
                  {copied ? <Check /> : <ContentCopy />}
                </IconShell>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {copied ? 'Copied' : 'Copy public key'}
            </TooltipContent>
          </Tooltip>
        </div>
      </TableCell>

      <TableCell size="small" className={COLUMN_WIDTHS.created}>
        {formatTimestamp(apiKey.created_at)}
      </TableCell>

      <TableCell size="small" className={COLUMN_WIDTHS.lastUsed}>
        {formatTimestamp(apiKey.last_used_at)}
      </TableCell>

      <TableCell size="small" className={COLUMN_WIDTHS.expires}>
        {formatTimestamp(apiKey.expires_at)}
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

  const handleCopy = useCallback(async (apiKey: APIKey) => {
    try {
      await navigator.clipboard.writeText(apiKey.public_key);
      setCopiedKeyId(apiKey.id);
      // One shared marker, so an earlier timer must not clear a later tick.
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
      resetTimer.current = setTimeout(
        () => setCopiedKeyId(null),
        COPY_RESET_MS,
      );
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, []);

  return (
    <Table className="table-fixed border-separate border-spacing-x-2 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small" className={COLUMN_WIDTHS.name}>
            Name
          </TableHead>
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
