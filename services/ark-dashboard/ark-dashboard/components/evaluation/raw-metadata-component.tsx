"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, ChevronRight, Code, Copy } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { EnhancedEvaluationMetadata } from "@/lib/services/evaluations"

interface RawMetadataComponentProps {
  metadata: EnhancedEvaluationMetadata
  rawMetadata?: Record<string, unknown>
  title?: string
  description?: string
}

export function RawMetadataComponent({ 
  metadata, 
  rawMetadata,
  title = "Raw Metadata",
  description = "Complete metadata for debugging and analysis"
}: RawMetadataComponentProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  // Combine enhanced metadata with raw metadata
  const combinedMetadata = {
    enhanced_metadata: metadata,
    ...(rawMetadata || {})
  }

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(combinedMetadata, null, 2))
      toast({
        variant: "default",
        title: "Copied to Clipboard",
        description: "Metadata has been copied to your clipboard"
      })
    } catch {
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Failed to copy metadata to clipboard"
      })
    }
  }

  // Check if we have any metadata to display
  const hasMetadata = Object.keys(combinedMetadata).length > 1 || 
    (Object.keys(combinedMetadata).length === 1 && Object.keys(metadata).some(key => 
      metadata[key as keyof EnhancedEvaluationMetadata] !== undefined && 
      metadata[key as keyof EnhancedEvaluationMetadata] !== null
    ))

  if (!hasMetadata) {
    return null
  }

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyToClipboard}
                className="flex items-center gap-2"
              >
                <Copy className="h-3 w-3" />
                Copy
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent>
            <div className="bg-muted/50 p-4 rounded-lg">
              <pre className="text-sm overflow-x-auto whitespace-pre-wrap font-mono">
                {JSON.stringify(combinedMetadata, null, 2)}
              </pre>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}