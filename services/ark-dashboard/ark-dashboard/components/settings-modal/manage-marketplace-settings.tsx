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

  const [editingSource, setEditingSource] = useState<MarketplaceSource | null>(
    null,
  );
  const [isAdding, setIsAdding] = useState(false);
  const [newSource, setNewSource] = useState<Partial<MarketplaceSource>>({
    name: '',
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
    setNewSource({ name: '', url: '', displayName: '' });
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
    setEditingSource(null);
    setIsAdding(false);
    setNewSource({ name: '', url: '', displayName: '' });
  };

  return (
    <div className="space-y-6">
      {/* Existing sources */}
      {sources.map(source => (
        <div
          key={source.id}
          className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-start justify-between">
            <h3 className="text-lg font-medium">{source.name}</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteSource(source.id)}
              className="h-8 w-8 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`url-${source.id}`}>Marketplace JSON URL</Label>
              <Input
                id={`url-${source.id}`}
                value={source.url}
                readOnly
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`display-${source.id}`}>
                Display name (optional)
              </Label>
              <Input
                id={`display-${source.id}`}
                value={source.displayName || ''}
                placeholder="e.g., ARK marketplace"
                readOnly
              />
            </div>
          </div>
        </div>
      ))}

      {/* Add new source form */}
      {isAdding && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <h3 className="text-lg font-medium">Add new marketplace</h3>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-url">Marketplace JSON URL</Label>
              <Input
                id="new-url"
                value={newSource.url || ''}
                onChange={e =>
                  setNewSource({ ...newSource, url: e.target.value })
                }
                placeholder="https://raw.githubusercontent.com/org/repo/main/marketplace.json"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-display">Display name (optional)</Label>
              <Input
                id="new-display"
                value={newSource.displayName || ''}
                onChange={e =>
                  setNewSource({ ...newSource, displayName: e.target.value })
                }
                placeholder="e.g., ARK marketplace"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleAddSource}>Add</Button>
          </div>
        </div>
      )}

      {/* Add new marketplace button */}
      {!isAdding && (
        <Button
          variant="ghost"
          className="flex items-center gap-2"
          onClick={() => setIsAdding(true)}>
          <Plus className="h-4 w-4" />
          Add new marketplace
        </Button>
      )}

      {/* Save/Cancel buttons */}
      <div className="flex justify-end gap-2 pt-6 border-t">
        <Button variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
}