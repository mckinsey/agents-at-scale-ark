'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { SpreadsheetData } from '@/components/file-preview/spreadsheet-viewer';
import type { ZipEntry } from '@/components/file-preview/zip-tree';
import { apiUrl } from '@/lib/api/config';
import { filesApiClient } from '@/lib/api/files-client';
import {
  getLanguageFromExtension,
  isImageFile,
  isJsonFile,
  isMarkdownFile,
  isSpreadsheetFile,
  isSvgFile,
  isZipFile,
} from '@/lib/utils/file-preview';

export interface PreviewFile {
  key: string;
  fileName: string;
  content: string;
  imageUrl: string | null;
  isImage: boolean;
  language: string | null;
  jsonData: unknown;
  isJson: boolean;
  zipEntries: ZipEntry[];
  isZip: boolean;
  spreadsheetData: SpreadsheetData | null;
  isSpreadsheet: boolean;
  isMarkdown: boolean;
  loading: boolean;
}

export function useFilePreview() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [file, setFile] = useState<PreviewFile | null>(null);

  const handlePreview = useCallback(async (key: string) => {
    const fileName = key.split('/').pop() || key;

    const newFile: PreviewFile = {
      key,
      fileName,
      content: '',
      imageUrl: null,
      isImage: false,
      language: null,
      jsonData: null,
      isJson: false,
      zipEntries: [],
      isZip: false,
      spreadsheetData: null,
      isSpreadsheet: false,
      isMarkdown: false,
      loading: true,
    };

    setFile(prev => {
      if (prev?.imageUrl) {
        URL.revokeObjectURL(prev.imageUrl);
      }
      return newFile;
    });
    setPreviewOpen(true);

    try {
      const url = filesApiClient.buildUrl(
        `files/${encodeURIComponent(key)}/download`,
      );
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
      }

      const blob = await response.blob();
      const fileExtension = key.split('.').pop()?.toLowerCase();
      const isImage = isImageFile(fileExtension);
      const isSvg = isSvgFile(fileExtension);
      const isJson = isJsonFile(fileExtension);
      const isZip = isZipFile(fileExtension);
      const isSpreadsheet = isSpreadsheetFile(fileExtension);
      const language = getLanguageFromExtension(fileExtension);

      const updatedFile: PreviewFile = { ...newFile, loading: false };

      if (isSpreadsheet) {
        try {
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
          });
          reader.readAsDataURL(blob);
          const base64Content = await base64Promise;

          const apiResponse = await fetch(
            apiUrl('/api/v1/file-preview/spreadsheet'),
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                content: base64Content,
                filename: key,
                mimeType: blob.type,
              }),
            },
          );

          if (!apiResponse.ok) {
            throw new Error(
              `Failed to parse spreadsheet: ${apiResponse.statusText}`,
            );
          }

          const spreadsheetData = await apiResponse.json();
          updatedFile.spreadsheetData = spreadsheetData;
          updatedFile.isSpreadsheet = true;
        } catch (error) {
          console.error('Failed to parse spreadsheet:', error);
          const text = await blob.text();
          updatedFile.content = text;
          updatedFile.isSpreadsheet = false;
          updatedFile.language = null;
        }
      } else if (isZip) {
        try {
          const JSZip = (await import('jszip')).default;
          const zip = await JSZip.loadAsync(blob);
          const entries: ZipEntry[] = [];

          zip.forEach((relativePath, zipEntry) => {
            const name =
              zipEntry.name.split('/').filter(Boolean).pop() || zipEntry.name;
            entries.push({
              name: name,
              path: zipEntry.name,
              size: (zipEntry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0,
              compressedSize: (zipEntry as unknown as { _data?: { compressedSize?: number } })._data?.compressedSize || 0,
              isDirectory: zipEntry.dir,
              lastModified: zipEntry.date.toISOString(),
            });
          });

          entries.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.path.localeCompare(b.path);
          });

          updatedFile.zipEntries = entries;
          updatedFile.isZip = true;
        } catch (error) {
          console.error('Failed to parse ZIP file:', error);
          updatedFile.content =
            'Unable to parse ZIP file structure. The file may be corrupted or not a valid ZIP archive.';
          updatedFile.isZip = false;
          updatedFile.language = null;
        }
      } else if (isImage || isSvg) {
        if (isSvg) {
          const text = await blob.text();
          const svgBlob = new Blob([text], { type: 'image/svg+xml' });
          updatedFile.imageUrl = URL.createObjectURL(svgBlob);
          updatedFile.isImage = true;
        } else {
          updatedFile.imageUrl = URL.createObjectURL(blob);
          updatedFile.isImage = true;
        }
      } else {
        const text = await blob.text();
        updatedFile.content = text;
        updatedFile.isImage = false;
        updatedFile.language = language;
        updatedFile.isMarkdown = isMarkdownFile(fileExtension);

        if (isJson) {
          try {
            updatedFile.jsonData = JSON.parse(text);
            updatedFile.isJson = true;
          } catch {
            updatedFile.isJson = false;
          }
        } else {
          updatedFile.isJson = false;
        }
      }

      setFile(updatedFile);
    } catch (error) {
      toast.error('Failed to Preview File', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
      setFile(null);
      setPreviewOpen(false);
    }
  }, []);

  const close = useCallback(() => {
    setFile(prev => {
      if (prev?.imageUrl) {
        URL.revokeObjectURL(prev.imageUrl);
      }
      return null;
    });
    setPreviewOpen(false);
  }, []);

  return {
    previewOpen,
    file,
    handlePreview,
    close,
  };
}
