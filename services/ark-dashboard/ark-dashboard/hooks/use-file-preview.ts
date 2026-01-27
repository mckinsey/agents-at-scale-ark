'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';

import { FILES_API_BASE_URL } from '@/lib/api/files-client';
import {
  getLanguageFromExtension,
  isImageFile,
  isSvgFile,
  isJsonFile,
  isZipFile,
  isSpreadsheetFile,
} from '@/lib/utils/file-preview';
import type { ZipEntry } from '@/components/file-preview/zip-tree';
import type { SpreadsheetData } from '@/components/file-preview/spreadsheet-viewer';

export function useFilePreview() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewIsImage, setPreviewIsImage] = useState(false);
  const [previewLanguage, setPreviewLanguage] = useState<string | null>(null);
  const [previewJsonData, setPreviewJsonData] = useState<unknown>(null);
  const [previewIsJson, setPreviewIsJson] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewZipEntries, setPreviewZipEntries] = useState<ZipEntry[]>([]);
  const [previewIsZip, setPreviewIsZip] = useState(false);
  const [previewSpreadsheetData, setPreviewSpreadsheetData] = useState<SpreadsheetData | null>(null);
  const [previewIsSpreadsheet, setPreviewIsSpreadsheet] = useState(false);

  const handlePreview = useCallback(async (key: string) => {
    setPreviewKey(key);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewContent('');
    setPreviewImageUrl(null);
    setPreviewIsImage(false);
    setPreviewLanguage(null);
    setPreviewJsonData(null);
    setPreviewIsJson(false);
    setPreviewZipEntries([]);
    setPreviewIsZip(false);
    setPreviewSpreadsheetData(null);
    setPreviewIsSpreadsheet(false);

    try {
      const url = `${FILES_API_BASE_URL}/files/${encodeURIComponent(key)}/download`;
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

      if (isSpreadsheet) {
        // Call the backend API to parse the spreadsheet
        try {
          // Convert blob to base64
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

          // Call the API endpoint
          const apiResponse = await fetch('/api/v1/file-preview/spreadsheet', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: base64Content,
              filename: key,
              mimeType: blob.type,
            }),
          });

          if (!apiResponse.ok) {
            throw new Error(`Failed to parse spreadsheet: ${apiResponse.statusText}`);
          }

          const spreadsheetData = await apiResponse.json();
          setPreviewSpreadsheetData(spreadsheetData);
          setPreviewIsSpreadsheet(true);
        } catch (error) {
          console.error('Failed to parse spreadsheet:', error);
          // Fallback to showing raw content
          const text = await blob.text();
          setPreviewContent(text);
          setPreviewIsSpreadsheet(false);
          setPreviewLanguage(null);
        }
      } else if (isZip) {
        // Parse ZIP file structure using JSZip
        try {
          const JSZip = (await import('jszip')).default;
          const zip = await JSZip.loadAsync(blob);
          const entries: ZipEntry[] = [];

          zip.forEach((relativePath, zipEntry) => {
            const name = zipEntry.name.split('/').filter(Boolean).pop() || zipEntry.name;
            entries.push({
              name: name,
              path: zipEntry.name,
              size: (zipEntry as any)._data?.uncompressedSize || 0,
              compressedSize: (zipEntry as any)._data?.compressedSize || 0,
              isDirectory: zipEntry.dir,
              lastModified: zipEntry.date.toISOString(),
            });
          });

          // Sort entries: directories first, then alphabetically
          entries.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.path.localeCompare(b.path);
          });

          setPreviewZipEntries(entries);
          setPreviewIsZip(true);
        } catch (error) {
          // Fallback to showing error message if ZIP parsing fails
          console.error('Failed to parse ZIP file:', error);
          setPreviewContent('Unable to parse ZIP file structure. The file may be corrupted or not a valid ZIP archive.');
          setPreviewIsZip(false);
          setPreviewLanguage(null);
        }
      } else if (isImage || isSvg) {
        // For SVG files, we need to handle them specially since they're text-based
        if (isSvg) {
          const text = await blob.text();
          // Create a blob with the correct MIME type for SVG
          const svgBlob = new Blob([text], { type: 'image/svg+xml' });
          const imageUrl = URL.createObjectURL(svgBlob);
          setPreviewImageUrl(imageUrl);
          setPreviewIsImage(true);
        } else {
          const imageUrl = URL.createObjectURL(blob);
          setPreviewImageUrl(imageUrl);
          setPreviewIsImage(true);
        }
      } else {
        const text = await blob.text();
        setPreviewContent(text);
        setPreviewIsImage(false);
        setPreviewLanguage(language);

        if (isJson) {
          try {
            const jsonData = JSON.parse(text);
            setPreviewJsonData(jsonData);
            setPreviewIsJson(true);
          } catch {
            setPreviewIsJson(false);
          }
        } else {
          setPreviewIsJson(false);
        }
      }
    } catch (error) {
      toast.error('Failed to Preview File', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    if (previewImageUrl) {
      URL.revokeObjectURL(previewImageUrl);
      setPreviewImageUrl(null);
    }
  }, [previewImageUrl]);

  return {
    previewOpen,
    previewKey,
    previewContent,
    previewImageUrl,
    previewIsImage,
    previewLanguage,
    previewJsonData,
    previewIsJson,
    previewZipEntries,
    previewIsZip,
    previewSpreadsheetData,
    previewIsSpreadsheet,
    previewLoading,
    handlePreview,
    closePreview,
    setPreviewOpen,
  };
}