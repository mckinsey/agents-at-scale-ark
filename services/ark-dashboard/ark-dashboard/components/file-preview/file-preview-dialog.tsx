'use client';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { JsonTree } from './json-tree';
import { SpreadsheetViewer } from './spreadsheet-viewer';
import type { SpreadsheetData } from './spreadsheet-viewer';
import { ZipTree } from './zip-tree';
import type { ZipEntry } from './zip-tree';

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName?: string | null;
  loading: boolean;
  isImage: boolean;
  imageUrl?: string | null;
  isJson: boolean;
  jsonData?: unknown;
  isZip?: boolean;
  zipEntries?: ZipEntry[];
  isSpreadsheet?: boolean;
  spreadsheetData?: SpreadsheetData | null;
  language?: string | null;
  content: string;
}

export function FilePreviewDialog({
  open,
  onOpenChange,
  fileName,
  loading,
  isImage,
  imageUrl,
  isJson,
  jsonData,
  isZip,
  zipEntries,
  isSpreadsheet,
  spreadsheetData,
  language,
  content,
}: FilePreviewDialogProps) {
  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen && imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{fileName || 'Preview'}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading file content...</p>
            </div>
          ) : isImage && imageUrl ? (
            <div className="flex items-center justify-center">
              <img
                src={imageUrl}
                alt={fileName || 'Preview'}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : isSpreadsheet && spreadsheetData ? (
            <SpreadsheetViewer data={spreadsheetData} />
          ) : isZip && zipEntries && zipEntries.length > 0 ? (
            <ZipTree entries={zipEntries} />
          ) : isJson && jsonData !== null ? (
            <JsonTree data={jsonData} />
          ) : language ? (
            <div className="overflow-hidden rounded-md">
              <SyntaxHighlighter
                language={language}
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  borderRadius: '0.375rem',
                }}>
                {content}
              </SyntaxHighlighter>
            </div>
          ) : (
            <pre className="pl-4 font-mono text-sm break-words whitespace-pre-wrap">
              {content}
            </pre>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
