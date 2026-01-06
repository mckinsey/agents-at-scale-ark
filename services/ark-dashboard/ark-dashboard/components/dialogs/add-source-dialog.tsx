'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddMarketplaceSource } from '@/lib/services/marketplace-hooks';

interface AddSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddSourceDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddSourceDialogProps) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const addSource = useAddMarketplaceSource({
    onSuccess: () => {
      onSuccess();
      handleReset();
    },
  });

  const handleReset = useCallback(() => {
    setUrl('');
    setName('');
    setError('');
  }, []);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        handleReset();
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, handleReset],
  );

  const validateUrl = (urlString: string): boolean => {
    try {
      const parsed = new URL(urlString);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleSubmit = useCallback(() => {
    setError('');

    if (!url.trim()) {
      setError('URL is required');
      return;
    }

    if (!validateUrl(url)) {
      setError('Please enter a valid HTTP or HTTPS URL');
      return;
    }

    addSource.mutate(
      {
        url: url.trim(),
        name: name.trim() || undefined,
      },
      {
        onError: (err: Error) => {
          setError(err.message);
        },
      },
    );
  }, [url, name, addSource]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent style={{ width: '50vw', maxWidth: '50vw' }}>
        <DialogHeader>
          <DialogTitle>Add Marketplace Source</DialogTitle>
          <DialogDescription>
            Add an external marketplace by providing the URL to its JSON file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="url">Marketplace JSON URL</Label>
            <Input
              id="url"
              placeholder="https://raw.githubusercontent.com/org/repo/main/marketplace.json"
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Enter the URL to a marketplace.json file
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Display Name (optional)</Label>
            <Input
              id="name"
              placeholder="Auto-detected from JSON if not provided"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {error && (
            <div className="border-destructive bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg border p-3 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={addSource.isPending}>
            {addSource.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {addSource.isPending ? 'Validating...' : 'Validate & Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
