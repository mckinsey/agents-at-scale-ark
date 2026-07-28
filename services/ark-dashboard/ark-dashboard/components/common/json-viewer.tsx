'use client';

import { useMemo, useState } from 'react';

import { Check, ContentCopy, SaveAlt } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';

interface JsonViewerProps {
  readonly value: unknown;
  readonly fileName?: string;
  readonly maxPreviewBytes?: number;
}

function safePretty(value: unknown, space = 2) {
  try {
    if (typeof value === 'string') {
      try {
        return JSON.stringify(JSON.parse(value), null, space);
      } catch {
        return value;
      }
    }
    return JSON.stringify(value, null, space);
  } catch {
    return String(value);
  }
}

export function JsonViewer({
  value,
  fileName = 'response',
  maxPreviewBytes = 50_000,
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const pretty = useMemo(() => safePretty(value), [value]);

  const tooBig = pretty.length > maxPreviewBytes;
  const shown =
    expanded || !tooBig
      ? pretty
      : `${pretty.slice(0, maxPreviewBytes)}\n… (truncated)`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(pretty).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([pretty], { type: 'application/json' });
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
    <div className="relative">
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
      <pre className="bg-muted/30 overflow-auto p-4 pt-10 font-mono text-xs break-words whitespace-pre-wrap">
        {shown}
      </pre>
    </div>
  );
}
