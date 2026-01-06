'use client';

import { ExternalLink, Link2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useGetMarketplaceSources,
  useRemoveMarketplaceSource,
} from '@/lib/services/marketplace-hooks';

import { AddSourceDialog } from './add-source-dialog';

interface ManageMarketplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageMarketplaceDialog({
  open,
  onOpenChange,
}: ManageMarketplaceDialogProps) {
  const [addSourceDialogOpen, setAddSourceDialogOpen] = useState(false);
  const { data: sources = [], isLoading } = useGetMarketplaceSources();
  const removeSource = useRemoveMarketplaceSource();

  const handleRemove = (name: string) => {
    if (confirm(`Are you sure you want to remove the source "${name}"?`)) {
      removeSource.mutate(name);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Manage Marketplace</DialogTitle>
            <DialogDescription>
              Configure external marketplace sources to discover and install
              items.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Marketplace Sources</h4>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddSourceDialogOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Add Source
              </Button>
            </div>

            {isLoading ? (
              <div className="text-muted-foreground py-4 text-center text-sm">
                Loading sources...
              </div>
            ) : sources.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <Link2 className="text-muted-foreground mx-auto h-8 w-8" />
                <p className="text-muted-foreground mt-2 text-sm">
                  No marketplace sources configured
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Add a source to discover items from external marketplaces
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {sources.map(source => (
                  <div
                    key={source.name}
                    className="flex items-center justify-between rounded-lg border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {source.name}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {source.url}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>Open URL</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive h-8 w-8 p-0"
                              onClick={() => handleRemove(source.name)}
                              disabled={removeSource.isPending}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remove Source</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddSourceDialog
        open={addSourceDialogOpen}
        onOpenChange={setAddSourceDialogOpen}
        onSuccess={() => setAddSourceDialogOpen(false)}
      />
    </>
  );
}
