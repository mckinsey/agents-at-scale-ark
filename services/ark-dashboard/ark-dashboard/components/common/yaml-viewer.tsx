'use client';

import { useState } from 'react';

import { Check, ContentCopy, SaveAlt } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';

interface YamlViewerProps {
  readonly yaml: string;
  readonly fileName?: string;
}

export function YamlViewer({ yaml, fileName = 'resource' }: YamlViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(yaml).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = yaml;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute inset-0">
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
      </div>
      <pre className="bg-muted/30 absolute inset-0 overflow-auto p-4 pt-10 font-mono text-xs">
        {yaml}
      </pre>
    </div>
  );
}
