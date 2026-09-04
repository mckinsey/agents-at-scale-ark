'use client';

import { useMemo, useState } from 'react';

import { Check, ContentCopy, SaveAlt } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { cn } from '@/lib/utils';

interface JsonViewerProps {
  readonly value: unknown;
  readonly fileName?: string;
  readonly maxPreviewBytes?: number;
  readonly className?: string;
}

function looksLikeJsonDocument(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

function unwrapJsonStrings(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && looksLikeJsonDocument(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function stringify(
  value: unknown,
  space: number,
  replacer?: (key: string, value: unknown) => unknown,
) {
  try {
    if (typeof value === 'string') {
      if (!(replacer && looksLikeJsonDocument(value))) {
        return value;
      }
      try {
        return JSON.stringify(JSON.parse(value), replacer, space) ?? value;
      } catch {
        return value;
      }
    }
    return JSON.stringify(value, replacer, space) ?? String(value);
  } catch {
    return String(value);
  }
}

export function JsonViewer({
  value,
  fileName = 'response',
  maxPreviewBytes = 50_000,
  className,
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const pretty = useMemo(() => stringify(value, 2, unwrapJsonStrings), [value]);
  // Copy and download must reproduce the payload the caller passed, not the
  // display transform, so a saved file still round-trips to the real resource.
  const raw = useMemo(() => stringify(value, 2), [value]);

  const tooBig = pretty.length > maxPreviewBytes;
  const shown =
    expanded || !tooBig
      ? pretty
      : `${pretty.slice(0, maxPreviewBytes)}\n… (truncated)`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn('relative flex min-h-0 flex-col', className)}>
      <div className="absolute top-2 right-4 z-10 flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 gap-1 px-2 text-xs">
          <IconShell size="sm">
            {copied ? <Check /> : <ContentCopy />}
          </IconShell>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownload}
          className="h-7 gap-1 px-2 text-xs">
          <IconShell size="sm">
            <SaveAlt />
          </IconShell>
          Download
        </Button>
        {tooBig && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(v => !v)}
            className="h-7 px-2 text-xs">
            {expanded ? 'Show less' : 'Load full'}
          </Button>
        )}
      </div>
      <pre className="bg-muted/30 min-h-0 flex-1 overflow-auto p-4 pt-10 font-mono text-xs break-words whitespace-pre-wrap">
        {shown}
      </pre>
    </div>
  );
}
