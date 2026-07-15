'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { Close, InsertDriveFile } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PreviewFile } from '@/hooks/use-file-preview';
import { renderMarkdown } from '@/lib/hooks/render-markdown';
import { cn } from '@/lib/utils';

import { JsonTree } from './json-tree';
import { SpreadsheetViewer } from './spreadsheet-viewer';
import { ZipTree } from './zip-tree';

type ViewMode = 'rendered' | 'source';

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: PreviewFile | null;
}

export function FilePreviewDialog({
  open,
  onOpenChange,
  file,
}: FilePreviewDialogProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('rendered');

  useEffect(() => {
    setViewMode('rendered');
  }, [file?.key]);

  const handleViewModeChange = (value: string) => {
    if (value !== 'rendered' && value !== 'source') return;
    setViewMode(value);
  };

  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Content
          className={cn(
            'bg-surface-primary border-stroke-tertiary data-[state=open]:animate-in data-[state=closed]:animate-out fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col gap-7 border-l p-10 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 sm:max-w-xl',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          )}
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}>
          <SheetHeader className="flex w-full flex-row items-center justify-between gap-2 space-y-0">
            <SheetTitle className="text-fg-primary text-xl leading-7 font-normal">
              File details
            </SheetTitle>
            <div className="flex items-center gap-2">
              {file?.isMarkdown && (
                <Tabs
                  value={viewMode}
                  onValueChange={handleViewModeChange}
                  size="sm"
                  className="w-auto flex-shrink-0">
                  <TabsList>
                    <TabsTrigger value="rendered">Rendered</TabsTrigger>
                    <TabsTrigger value="source">Source</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
              <SheetPrimitive.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close">
                  <Close className="size-4" />
                </Button>
              </SheetPrimitive.Close>
            </div>
          </SheetHeader>

          <div className="flex min-h-0 w-full flex-1 flex-col gap-3">
            {file && (
              <>
                <div className="flex items-center gap-2">
                  <IconShell size="sm" variant="secondary">
                    <InsertDriveFile />
                  </IconShell>
                  <span
                    className="text-fg-primary min-w-0 truncate text-sm"
                    title={file.fileName}>
                    {file.fileName}
                  </span>
                </div>
                <div className="border-stroke-tertiary w-full border-b" />
              </>
            )}

            <div className="w-full flex-1 overflow-y-auto">
              {file ? (
                file.loading ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-muted-foreground">
                      Loading file content...
                    </p>
                  </div>
                ) : file.isImage && file.imageUrl ? (
                  <div className="flex items-center justify-center">
                    <img
                      src={file.imageUrl}
                      alt={file.fileName}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : file.isSpreadsheet && file.spreadsheetData ? (
                  <SpreadsheetViewer data={file.spreadsheetData} />
                ) : file.isZip &&
                  file.zipEntries &&
                  file.zipEntries.length > 0 ? (
                  <ZipTree entries={file.zipEntries} />
                ) : file.isJson && file.jsonData !== null ? (
                  <JsonTree data={file.jsonData} />
                ) : file.isMarkdown && viewMode === 'rendered' ? (
                  <div className="px-4">{renderMarkdown(file.content)}</div>
                ) : file.isMarkdown ? (
                  <pre className="overflow-x-auto px-4 font-mono text-sm whitespace-pre">
                    {file.content}
                  </pre>
                ) : file.language ? (
                  <div className="overflow-hidden rounded-md">
                    <SyntaxHighlighter
                      language={file.language}
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        borderRadius: '0.375rem',
                      }}>
                      {file.content}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <pre className="pl-4 font-mono text-sm break-words whitespace-pre-wrap">
                    {file.content}
                  </pre>
                )
              ) : (
                <div className="flex items-center justify-center py-8">
                  <p className="text-muted-foreground">No file selected</p>
                </div>
              )}
            </div>
          </div>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}
