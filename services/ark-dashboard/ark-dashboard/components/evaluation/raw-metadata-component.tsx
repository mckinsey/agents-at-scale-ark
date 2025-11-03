'use client';

import { Code, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { EnhancedEvaluationMetadata } from '@/lib/services/evaluations';

interface RawMetadataComponentProps {
  metadata: EnhancedEvaluationMetadata;
  rawMetadata?: Record<string, unknown>;
  title?: string;
  description?: string;
}

export function RawMetadataComponent({
  metadata,
  rawMetadata,
  title = 'Raw Metadata',
  description = 'Complete metadata for debugging and analysis',
}: RawMetadataComponentProps) {
  // Combine enhanced metadata with raw metadata
  const combinedMetadata = {
    enhanced_metadata: metadata,
    ...(rawMetadata || {}),
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(combinedMetadata, null, 2),
      );
      toast('Copied to Clipboard', {
        description: 'Metadata has been copied to your clipboard',
      });
    } catch {
      toast.error('Copy Failed', {
        description: 'Failed to copy metadata to clipboard',
      });
    }
  };

  // Check if we have any metadata to display
  const hasMetadata =
    Object.keys(combinedMetadata).length > 1 ||
    (Object.keys(combinedMetadata).length === 1 &&
      Object.keys(metadata).some(
        key =>
          metadata[key as keyof EnhancedEvaluationMetadata] !== undefined &&
          metadata[key as keyof EnhancedEvaluationMetadata] !== null,
      ));

  if (!hasMetadata) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex w-full items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyToClipboard}
            className="flex items-center gap-2">
            <Copy className="h-3 w-3" />
            Copy
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="bg-muted/50 rounded-lg p-4">
          <pre className="overflow-x-auto font-mono text-sm whitespace-pre-wrap">
            {JSON.stringify(combinedMetadata, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
