'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface MarketplaceSource {
  id: string;
  name: string;
  url: string;
  displayName?: string;
}

export function ManageMarketplaceSettings() {
  const [sources, setSources] = useState<MarketplaceSource[]>([
    {
      id: '1',
      name: 'ARK marketplace',
      url: 'https://raw.githubusercontent.com/org/repo/main/marketplace.json',
      displayName: 'ARK marketplace',
    },
  ]);

  const [isAdding, setIsAdding] = useState(false);
  const [newSource, setNewSource] = useState<Partial<MarketplaceSource>>({
    url: '',
    displayName: '',
  });

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
    };

    setSources([...sources, source]);
    setNewSource({ url: '', displayName: '' });
    setIsAdding(false);
    toast.success('Marketplace source added');
  };

  const handleDeleteSource = (id: string) => {
    setSources(sources.filter(s => s.id !== id));
    toast.success('Marketplace source removed');
  };

  const handleSave = () => {
    // TODO: Implement actual save logic to backend
    toast.success('Marketplace settings saved');
  };

  const handleCancel = () => {
    setIsAdding(false);
    setNewSource({ url: '', displayName: '' });
  };

  return (
    <div className="space-y-6">
      {/* Existing sources */}
      {sources.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Marketplace Sources</h2>
          <div className="space-y-3">
            {sources.map(source => (
              <div key={source.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-4">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">{source.name}</Label>
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

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteSource(source.id)}
                    className="ml-4 h-8 w-8 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
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