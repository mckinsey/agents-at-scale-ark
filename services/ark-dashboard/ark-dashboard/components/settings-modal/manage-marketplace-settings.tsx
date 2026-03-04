'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { marketplaceSourcesAtom, type MarketplaceSource } from '@/atoms/marketplace-sources';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function validateMarketplaceUrl(url: string): string | null {
  if (!url) {
    return 'Marketplace URL is required';
  }
  if (!url.startsWith('https://')) {
    return 'Only HTTPS URLs are allowed';
  }
  if (!url.endsWith('/marketplace.json')) {
    return 'URL must point to a marketplace.json file';
  }
  return null;
}

export function ManageMarketplaceSettings() {
  const queryClient = useQueryClient();
  const [sources, setSources] = useAtom(marketplaceSourcesAtom);

  const [isAdding, setIsAdding] = useState(false);
  const [newSource, setNewSource] = useState<Partial<MarketplaceSource>>({
    url: '',
    displayName: '',
  });
  const [urlError, setUrlError] = useState<string | null>(null);

  const handleAddSource = async () => {
    const error = validateMarketplaceUrl(newSource.url || '');
    if (error) {
      setUrlError(error);
      return;
    }

    const source: MarketplaceSource = {
      id: Date.now().toString(),
      name: newSource.displayName || 'Marketplace JSON URL',
      url: newSource.url!,
      displayName: newSource.displayName,
      enabled: true,
    };

    const updated = [...sources, source];
    setSources(updated);
    await queryClient.invalidateQueries({ queryKey: ['marketplace'] });

    setNewSource({ url: '', displayName: '' });
    setUrlError(null);
    setIsAdding(false);
  };

  const handleDeleteSource = async (id: string) => {
    if (id === 'default') {
      toast.error('Cannot delete the default marketplace source');
      return;
    }
    const updated = sources.filter(s => s.id !== id);
    setSources(updated);
    await queryClient.invalidateQueries({ queryKey: ['marketplace'] });
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewSource({ url: '', displayName: '' });
    setUrlError(null);
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    toast.success('Marketplace data refreshed');
  };

  return (
    <div className="space-y-6">
      {/* Existing sources */}
      {sources.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Marketplace Sources</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="flex items-center gap-2">
              <RefreshCw className="h-3 w-3" />
              Refresh Data
            </Button>
          </div>
          <div className="space-y-3">
            {sources.map(source => (
              <div key={source.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-4">
                    <Label className="text-sm font-medium">{source.name}</Label>

                    <div className="space-y-3">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">
                          Marketplace JSON URL
                        </div>
                        <Input
                          value={source.url}
                          readOnly
                          className="font-mono text-sm bg-muted/50"
                        />
                      </div>

                      <div>
                        <div className="text-sm text-muted-foreground mb-1">
                          Display name (optional)
                        </div>
                        <Input
                          value={source.displayName || ''}
                          placeholder="e.g., ARK marketplace"
                          readOnly
                          className="text-sm bg-muted/50"
                        />
                      </div>
                    </div>
                  </div>

                  {source.id !== 'default' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteSource(source.id)}
                      className="ml-4 h-8 w-8 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add new source form */}
      {isAdding && (
        <div className="rounded-lg border p-4">
          <h3 className="mb-4 text-sm font-medium">Add new marketplace</h3>

          <div className="space-y-3">
            <div>
              <Label htmlFor="new-url" className="text-sm">
                Marketplace JSON URL
              </Label>
              <Input
                id="new-url"
                value={newSource.url || ''}
                onChange={e => {
                  setNewSource({ ...newSource, url: e.target.value });
                  setUrlError(null);
                }}
                placeholder="https://raw.githubusercontent.com/org/repo/main/marketplace.json"
                className={`mt-1.5 font-mono text-sm${urlError ? ' border-destructive' : ''}`}
              />
              {urlError && (
                <p className="mt-1 text-xs text-destructive">{urlError}</p>
              )}
            </div>

            <div>
              <Label htmlFor="new-display" className="text-sm">
                Display name (optional)
              </Label>
              <Input
                id="new-display"
                value={newSource.displayName || ''}
                onChange={e =>
                  setNewSource({ ...newSource, displayName: e.target.value })
                }
                placeholder="e.g., ARK marketplace"
                className="mt-1.5 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleCancelAdd}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddSource}>
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Add new marketplace button */}
      {!isAdding && (
        <div>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4" />
            Add new marketplace
          </Button>
        </div>
      )}
    </div>
  );
}