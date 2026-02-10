'use client';

import { AlertCircle, FileSpreadsheet, TableIcon } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface SpreadsheetSheet {
  name: string;
  columns: string[];
  rows: string[][];
  totalRows: number;
  totalColumns: number;
  previewLimited: boolean;
}

export interface SpreadsheetData {
  sheets: SpreadsheetSheet[];
  metadata: {
    fileType: string;
    filename: string;
    sheetCount: number;
    hasFormulas?: boolean;
    encoding?: string;
  };
}

interface SpreadsheetViewerProps {
  data: SpreadsheetData;
}

export function SpreadsheetViewer({ data }: SpreadsheetViewerProps) {
  const [activeSheet, setActiveSheet] = useState(0);

  if (!data || !data.sheets || data.sheets.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">No spreadsheet data available</p>
      </div>
    );
  }

  const currentSheet = data.sheets[activeSheet];

  return (
    <div className="space-y-4">
      {/* Metadata */}
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <FileSpreadsheet className="h-4 w-4" />
        <span>
          {data.metadata.fileType.toUpperCase()} • {data.metadata.sheetCount}{' '}
          sheet
          {data.metadata.sheetCount !== 1 ? 's' : ''}{' '}
          {data.metadata.hasFormulas && ' • Contains formulas'}
        </span>
      </div>

      {/* Sheet tabs */}
      {data.sheets.length > 1 ? (
        <Tabs
          value={activeSheet.toString()}
          onValueChange={v => setActiveSheet(parseInt(v))}>
          <TabsList>
            {data.sheets.map((sheet, index) => (
              <TabsTrigger key={index} value={index.toString()}>
                {sheet.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {data.sheets.map((sheet, index) => (
            <TabsContent key={index} value={index.toString()} className="mt-4">
              <SheetContent sheet={sheet} />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <SheetContent sheet={currentSheet} />
      )}
    </div>
  );
}

function SheetContent({ sheet }: { sheet: SpreadsheetSheet }) {
  // Check if the first row looks like headers (for CSV/TSV files)
  const hasHeaders =
    sheet.rows.length > 0 &&
    sheet.rows[0].every(
      cell =>
        typeof cell === 'string' && cell.length > 0 && !cell.match(/^\d+$/), // Not purely numeric
    );

  const headers = hasHeaders ? sheet.rows[0] : sheet.columns;
  const dataRows = hasHeaders ? sheet.rows.slice(1) : sheet.rows;

  return (
    <div className="space-y-4">
      {/* Preview limitation warning */}
      {sheet.previewLimited && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Preview limited to first 1000 rows and 26 columns. Total:{' '}
            {sheet.totalRows} rows × {sheet.totalColumns} columns
          </AlertDescription>
        </Alert>
      )}

      {/* Table info */}
      <div className="text-muted-foreground flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1">
          <TableIcon className="h-3 w-3" />
          {sheet.totalRows} rows
        </span>
        <span>•</span>
        <span>{sheet.totalColumns} columns</span>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="bg-background sticky left-0 z-10 w-12 text-center">
                #
              </TableHead>
              {headers.map((header, index) => (
                <TableHead key={index} className="min-w-[100px]">
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {dataRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={headers.length + 1}
                  className="text-muted-foreground text-center">
                  No data
                </TableCell>
              </TableRow>
            ) : (
              dataRows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  <TableCell className="bg-background sticky left-0 z-10 text-center font-mono text-xs">
                    {hasHeaders ? rowIndex + 2 : rowIndex + 1}
                  </TableCell>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex} className="font-mono text-sm">
                      {formatCellValue(cell)}
                    </TableCell>
                  ))}
                  {/* Fill empty cells if row is shorter than headers */}
                  {row.length < headers.length &&
                    Array(headers.length - row.length)
                      .fill(null)
                      .map((_, i) => <TableCell key={`empty-${i}`} />)}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatCellValue(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  // Check if it looks like a number
  const numValue = parseFloat(value);
  if (!isNaN(numValue) && value === numValue.toString()) {
    // Format large numbers with commas
    if (Math.abs(numValue) >= 1000) {
      return numValue.toLocaleString();
    }
    return value;
  }

  // Check if it's a boolean-like value
  const lowerValue = value.toLowerCase();
  if (lowerValue === 'true' || lowerValue === 'false') {
    return lowerValue;
  }

  // Check if it looks like a date/time (ISO format)
  if (value.match(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/)) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString();
      }
    } catch {}
  }

  // Return as-is for other strings
  return value;
}
