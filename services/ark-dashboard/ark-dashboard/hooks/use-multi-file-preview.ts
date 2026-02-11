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

export interface PreviewTab {
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
  loading: boolean;
}

export function useMultiFilePreview() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tabs, setTabs] = useState<PreviewTab[]>([]);
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null);

  const handlePreview = useCallback(async (key: string) => {
    // Check if this file is already open
    const existingTab = tabs.find(tab => tab.key === key);
    if (existingTab) {
      // Just switch to the existing tab
      setActiveTabKey(key);
      setPreviewOpen(true);
      return;
    }

    const fileName = key.split('/').pop() || key;

    // Create a new tab with loading state
    const newTab: PreviewTab = {
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
      loading: true,
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabKey(key);
    setPreviewOpen(true);

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

      const updatedTab: PreviewTab = { ...newTab, loading: false };

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
          updatedTab.spreadsheetData = spreadsheetData;
          updatedTab.isSpreadsheet = true;
        } catch (error) {
          console.error('Failed to parse spreadsheet:', error);
          // Fallback to showing raw content
          const text = await blob.text();
          updatedTab.content = text;
          updatedTab.isSpreadsheet = false;
          updatedTab.language = null;
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

          updatedTab.zipEntries = entries;
          updatedTab.isZip = true;
        } catch (error) {
          // Fallback to showing error message if ZIP parsing fails
          console.error('Failed to parse ZIP file:', error);
          updatedTab.content = 'Unable to parse ZIP file structure. The file may be corrupted or not a valid ZIP archive.';
          updatedTab.isZip = false;
          updatedTab.language = null;
        }
      } else if (isImage || isSvg) {
        // For SVG files, we need to handle them specially since they're text-based
        if (isSvg) {
          const text = await blob.text();
          // Create a blob with the correct MIME type for SVG
          const svgBlob = new Blob([text], { type: 'image/svg+xml' });
          const imageUrl = URL.createObjectURL(svgBlob);
          updatedTab.imageUrl = imageUrl;
          updatedTab.isImage = true;
        } else {
          const imageUrl = URL.createObjectURL(blob);
          updatedTab.imageUrl = imageUrl;
          updatedTab.isImage = true;
        }
      } else {
        const text = await blob.text();
        updatedTab.content = text;
        updatedTab.isImage = false;
        updatedTab.language = language;

        if (isJson) {
          try {
            const jsonData = JSON.parse(text);
            updatedTab.jsonData = jsonData;
            updatedTab.isJson = true;
          } catch {
            updatedTab.isJson = false;
          }
        } else {
          updatedTab.isJson = false;
        }
      }

      // Update the tab with the loaded content
      setTabs(prev => prev.map(tab => tab.key === key ? updatedTab : tab));
    } catch (error) {
      toast.error('Failed to Preview File', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
      // Remove the tab if loading failed
      setTabs(prev => prev.filter(tab => tab.key !== key));
      if (tabs.length === 1) {
        setPreviewOpen(false);
      }
    }
  }, [tabs]);

  const closeTab = useCallback((key: string) => {
    setTabs(prev => {
      const newTabs = prev.filter(tab => {
        if (tab.key === key && tab.imageUrl) {
          URL.revokeObjectURL(tab.imageUrl);
        }
        return tab.key !== key;
      });

      // If we closed the active tab, switch to another tab or close dialog
      if (key === activeTabKey) {
        if (newTabs.length > 0) {
          setActiveTabKey(newTabs[newTabs.length - 1].key);
        } else {
          setActiveTabKey(null);
          setPreviewOpen(false);
        }
      }

      return newTabs;
    });
  }, [activeTabKey]);

  const closeAllTabs = useCallback(() => {
    // Clean up all image URLs
    tabs.forEach(tab => {
      if (tab.imageUrl) {
        URL.revokeObjectURL(tab.imageUrl);
      }
    });
    setTabs([]);
    setActiveTabKey(null);
    setPreviewOpen(false);
  }, [tabs]);

  const activeTab = tabs.find(tab => tab.key === activeTabKey) || null;

  return {
    previewOpen,
    tabs,
    activeTab,
    activeTabKey,
    handlePreview,
    closeTab,
    closeAllTabs,
    setActiveTabKey,
    setPreviewOpen,
  };
}