'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { marketplaceSourcesAtom, type MarketplaceSource } from '@/atoms/marketplace-sources';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export function ManageMarketplaceSettings() {
  const queryClient = useQueryClient();
  const [sources, setSources] = useAtom(marketplaceSourcesAtom);
  const [localSources, setLocalSources] = useState<MarketplaceSource[]>([]);

  const [isAdding, setIsAdding] = useState(false);
  const [newSource, setNewSource] = useState<Partial<MarketplaceSource>>({
    url: '',
    displayName: '',
  });

  // Load sources from persistent storage on mount
  useEffect(() => {
    setLocalSources(sources);
  }, [sources]);

  const handleAddSource = () => {
    if (!newSource.url) {
      toast.error('Marketplace URL is required');
      return;
    }

    const source: MarketplaceSource = {
      id: Date.now().toString(),
      name: newSource.displayName || 'Marketplace JSON URL',
      url: newSource.url,
      displayName: newSource.displayName,
      enabled: true,
    };

    setLocalSources([...localSources, source]);
    setNewSource({ url: '', displayName: '' });
    setIsAdding(false);
  };

  const handleDeleteSource = (id: string) => {
    // Don't allow deleting the default source
    if (id === 'default') {
      toast.error('Cannot delete the default marketplace source');
      return;
    }
    setLocalSources(localSources.filter(s => s.id !== id));
  };

  const handleToggleSource = (id: string) => {
    setLocalSources(localSources.map(s =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    ));
  };

  const handleSave = async () => {
    // Save to persistent storage
    setSources(localSources);

    // Invalidate marketplace queries to refresh data
    await queryClient.invalidateQueries({ queryKey: ['marketplace'] });

    toast.success('Marketplace settings saved and data refreshed');
  };

  const handleCancel = () => {
    setIsAdding(false);
    setNewSource({ url: '', displayName: '' });
    // Reset to original sources
    setLocalSources(sources);
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['marketplace'] });
    toast.success('Marketplace data refreshed');
  };

  return (
    <div className="space-y-6">
      {/* Existing sources */}
      {localSources.length > 0 && (
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
            {localSources.map(source => (
              <div key={source.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">{source.name}</Label>
                      <Switch
                        checked={source.enabled !== false}
                        onCheckedChange={() => handleToggleSource(source.id)}
                      />
                    </div>

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
                onChange={e =>
                  setNewSource({ ...newSource, url: e.target.value })
                }
                placeholder="https://raw.githubusercontent.com/org/repo/main/marketplace.json"
                className="mt-1.5 font-mono text-sm"
              />
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
            <Button variant="outline" size="sm" onClick={handleCancel}>
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

      {/* Save/Cancel buttons */}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
}