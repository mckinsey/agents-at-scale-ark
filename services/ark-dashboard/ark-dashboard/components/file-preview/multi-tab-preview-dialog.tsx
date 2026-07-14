'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { Close, InsertDriveFile } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { PreviewTab } from '@/hooks/use-multi-file-preview';
import { renderMarkdown } from '@/lib/hooks/render-markdown';
import { cn } from '@/lib/utils';

import { JsonTree } from './json-tree';
import { SpreadsheetViewer } from './spreadsheet-viewer';
import { ZipTree } from './zip-tree';

type ViewMode = 'rendered' | 'source';

interface MultiTabPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tabs: PreviewTab[];
  activeTab: PreviewTab | null;
  activeTabKey: string | null;
  onTabClick: (key: string) => void;
  onTabClose: (key: string) => void;
  onCloseAll: () => void;
}

export function MultiTabPreviewDialog({
  open,
  onOpenChange,
  tabs,
  activeTab,
  activeTabKey,
  onCloseAll,
}: MultiTabPreviewDialogProps) {
  const [viewModes, setViewModes] = useState<Record<string, ViewMode>>({});

  useEffect(() => {
    setViewModes(prev => {
      const next: Record<string, ViewMode> = {};
      for (const tab of tabs) {
        if (prev[tab.key]) {
          next[tab.key] = prev[tab.key];
        }
      }
      return next;
    });
  }, [tabs]);

  const activeViewMode: ViewMode =
    (activeTabKey && viewModes[activeTabKey]) || 'rendered';

  const handleViewModeChange = (value: string) => {
    if (!activeTabKey) return;
    if (value !== 'rendered' && value !== 'source') return;
    setViewModes(prev => ({ ...prev, [activeTabKey]: value }));
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onCloseAll();
    }
    onOpenChange(isOpen);
  };

  return (
    <SheetPrimitive.Root
      open={open}
      onOpenChange={handleOpenChange}
      modal={false}>
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
              {activeTab?.isMarkdown && (
                <ToggleGroup
                  type="single"
                  size="sm"
                  variant="outline"
                  value={activeViewMode}
                  onValueChange={handleViewModeChange}
                  className="flex-shrink-0">
                  <ToggleGroupItem value="rendered" aria-label="Rendered view">
                    Rendered
                  </ToggleGroupItem>
                  <ToggleGroupItem value="source" aria-label="Source view">
                    Source
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
              <SheetPrimitive.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close">
                  <Close className="size-4" />
                </Button>
              </SheetPrimitive.Close>
            </div>
          </SheetHeader>

          <div className="flex min-h-0 w-full flex-1 flex-col gap-3">
            {activeTab && (
              <>
                <div className="flex items-center gap-2">
                  <IconShell size="sm" variant="secondary">
                    <InsertDriveFile />
                  </IconShell>
                  <span
                    className="text-fg-primary min-w-0 truncate text-sm"
                    title={activeTab.fileName}>
                    {activeTab.fileName}
                  </span>
                </div>
                <div className="border-stroke-tertiary w-full border-b" />
              </>
            )}

            {/* Content */}
            <div className="w-full flex-1 overflow-y-auto">
              {activeTab ? (
                activeTab.loading ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-muted-foreground">
                      Loading file content...
                    </p>
                  </div>
                ) : activeTab.isImage && activeTab.imageUrl ? (
                  <div className="flex items-center justify-center">
                    <img
                      src={activeTab.imageUrl}
                      alt={activeTab.fileName}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : activeTab.isSpreadsheet && activeTab.spreadsheetData ? (
                  <SpreadsheetViewer data={activeTab.spreadsheetData} />
                ) : activeTab.isZip &&
                  activeTab.zipEntries &&
                  activeTab.zipEntries.length > 0 ? (
                  <ZipTree entries={activeTab.zipEntries} />
                ) : activeTab.isJson && activeTab.jsonData !== null ? (
                  <JsonTree data={activeTab.jsonData} />
                ) : activeTab.isMarkdown && activeViewMode === 'rendered' ? (
                  <div className="px-4">
                    {renderMarkdown(activeTab.content)}
                  </div>
                ) : activeTab.isMarkdown ? (
                  <pre className="overflow-x-auto px-4 font-mono text-sm whitespace-pre">
                    {activeTab.content}
                  </pre>
                ) : activeTab.language ? (
                  <div className="overflow-hidden rounded-md">
                    <SyntaxHighlighter
                      language={activeTab.language}
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        borderRadius: '0.375rem',
                      }}>
                      {activeTab.content}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <pre className="pl-4 font-mono text-sm break-words whitespace-pre-wrap">
                    {activeTab.content}
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
