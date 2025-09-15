"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { EnhancedEvaluationMetadata } from "@/lib/services/evaluations";
import { Code, Copy } from "lucide-react";

interface RawMetadataComponentProps {
  metadata: EnhancedEvaluationMetadata;
  rawMetadata?: Record<string, unknown>;
  title?: string;
  description?: string;
}

export function RawMetadataComponent({
  metadata,
  rawMetadata,
  title = "Raw Metadata",
  description = "Complete metadata for debugging and analysis"
}: RawMetadataComponentProps) {
  // Combine enhanced metadata with raw metadata
  const combinedMetadata = {
    enhanced_metadata: metadata,
    ...(rawMetadata || {})
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(combinedMetadata, null, 2)
      );
      toast({
        variant: "default",
        title: "Copied to Clipboard",
        description: "Metadata has been copied to your clipboard"
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Failed to copy metadata to clipboard"
      });
    }
  };

  // Check if we have any metadata to display
  const hasMetadata =
    Object.keys(combinedMetadata).length > 1 ||
    (Object.keys(combinedMetadata).length === 1 &&
      Object.keys(metadata).some(
        (key) =>
          metadata[key as keyof EnhancedEvaluationMetadata] !== undefined &&
          metadata[key as keyof EnhancedEvaluationMetadata] !== null
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
            className="flex items-center gap-2"
          >
            <Copy className="h-3 w-3" />
            Copy
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="bg-muted/50 p-4 rounded-lg">
          <pre className="text-sm overflow-x-auto whitespace-pre-wrap font-mono">
            {JSON.stringify(combinedMetadata, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
