'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';

import { FILES_API_BASE_URL } from '@/lib/api/files-client';
import {
  getLanguageFromExtension,
  isImageFile,
  isSvgFile,
  isJsonFile,
} from '@/lib/utils/file-preview';

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
      const language = getLanguageFromExtension(fileExtension);

      if (isImage || isSvg) {
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
    previewLoading,
    handlePreview,
    closePreview,
    setPreviewOpen,
  };
}