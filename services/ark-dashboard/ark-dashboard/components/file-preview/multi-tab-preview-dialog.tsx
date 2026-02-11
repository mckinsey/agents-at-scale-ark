'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X, XIcon } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { PreviewTab } from '@/hooks/use-multi-file-preview';
import { cn } from '@/lib/utils';

import { JsonTree } from './json-tree';
import { SpreadsheetViewer } from './spreadsheet-viewer';
import { ZipTree } from './zip-tree';

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
  onTabClick,
  onTabClose,
  onCloseAll,
}: MultiTabPreviewDialogProps) {
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
            'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l',
            'flex w-full flex-col sm:max-w-4xl',
          )}
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}>
          <SheetHeader>
            <SheetTitle>File Preview</SheetTitle>
          </SheetHeader>

          <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>

          {/* Tabs */}
          {tabs.length > 0 && (
            <div className="border-b">
              <ScrollArea className="w-full">
                <div className="flex gap-1 p-1">
                  {tabs.map(tab => (
                    <div
                      key={tab.key}
                      className={cn(
                        'group flex cursor-pointer items-center gap-2 rounded-t-md px-3 py-1.5 transition-colors',
                        activeTabKey === tab.key
                          ? 'bg-background border-b-background border'
                          : 'bg-muted/50 hover:bg-muted border border-transparent',
                      )}
                      onClick={() => onTabClick(tab.key)}>
                      <span
                        className="max-w-[150px] truncate text-sm"
                        title={tab.fileName}>
                        {tab.fileName}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-transparent"
                        onClick={e => {
                          e.stopPropagation();
                          onTabClose(tab.key);
                        }}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
          )}

          {/* Content */}
          <div className="mt-4 flex-1 overflow-y-auto">
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
                <pre className="font-mono text-sm break-words whitespace-pre-wrap">
                  {activeTab.content}
                </pre>
              )
            ) : (
              <div className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">No file selected</p>
              </div>
            )}
          </div>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}
