'use client';

import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateLocalItem,
  useGetMarketplaceItems,
} from '@/lib/services/marketplace-hooks';
import type { LocalItemCreate } from '@/lib/types/marketplace';

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const ITEM_TYPES = [
  { value: 'executor', label: 'Agent Template Implementation', enabled: true },
  { value: 'agent', label: 'Agent', enabled: false },
  { value: 'service', label: 'Service', enabled: false },
  { value: 'team', label: 'Team', enabled: false },
  { value: 'tool', label: 'Tool', enabled: false },
];

const DEFAULT_CATEGORIES = [
  'Agents',
  'Development',
  'Infrastructure',
  'Observability',
  'Tools',
];

export function AddItemDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddItemDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    description: '',
    version: '1.0.0',
    author: '',
    type: '',
    category: '',
    tags: '',
    image: '',
  });
  const [error, setError] = useState('');

  const { data: marketplaceItems = [] } = useGetMarketplaceItems();

  const availableCategories = useMemo(() => {
    const categoriesFromItems = marketplaceItems
      .map(item => item.category)
      .filter(Boolean);
    const allCategories = [
      ...new Set([...DEFAULT_CATEGORIES, ...categoriesFromItems]),
    ];
    return allCategories.sort((a, b) => a.localeCompare(b));
  }, [marketplaceItems]);

  const createItem = useCreateLocalItem({
    onSuccess: () => {
      onSuccess();
      handleReset();
    },
  });

  const handleReset = useCallback(() => {
    setFormData({
      name: '',
      displayName: '',
      description: '',
      version: '1.0.0',
      author: '',
      type: '',
      category: '',
      tags: '',
      image: '',
    });
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

  const formatName = (value: string): string => {
    return value
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  };

  const handleNameChange = (value: string) => {
    const formatted = formatName(value);
    setFormData(prev => ({ ...prev, name: formatted }));
  };

  const handleSubmit = useCallback(() => {
    setError('');

    if (!formData.type.trim()) {
      setError('Type is required');
      return;
    }
    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formData.displayName.trim()) {
      setError('Display name is required');
      return;
    }
    if (!formData.description.trim()) {
      setError('Description is required');
      return;
    }
    if (!formData.image.trim()) {
      setError('Container image is required');
      return;
    }
    if (!formData.author.trim()) {
      setError('Author is required');
      return;
    }
    if (!formData.category.trim()) {
      setError('Category is required');
      return;
    }

    const item: LocalItemCreate = {
      name: formData.name.trim(),
      displayName: formData.displayName.trim(),
      description: formData.description.trim(),
      version: formData.version.trim() || '1.0.0',
      author: formData.author.trim(),
      type: 'executor',
      category: formData.category.trim(),
      tags: formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
      ark: {
        image: formData.image.trim(),
        agentic: true,
      },
    };

    createItem.mutate(item, {
      onError: (err: Error) => {
        setError(err.message);
      },
    });
  }, [formData, createItem]);

  const showFormFields = formData.type.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto"
        style={{ width: '60vw', maxWidth: '60vw' }}>
        <DialogHeader>
          <DialogTitle>Add Item to Marketplace</DialogTitle>
          <DialogDescription>
            Add a new item to your local marketplace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select
              value={formData.type}
              onValueChange={v => setFormData(prev => ({ ...prev, type: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select a type..." />
              </SelectTrigger>
              <SelectContent>
                {ITEM_TYPES.map(type => (
                  <SelectItem
                    key={type.value}
                    value={type.value}
                    disabled={!type.enabled}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showFormFields && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="my-agent-template"
                  value={formData.name}
                  onChange={e => handleNameChange(e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Unique identifier (lowercase, hyphens only, no spaces)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  placeholder="My Agent Template"
                  value={formData.displayName}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      displayName: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="A brief description of this agent template..."
                  value={formData.description}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="image">Container Image</Label>
                <Input
                  id="image"
                  placeholder="ghcr.io/org/my-agent:v1.0.0"
                  value={formData.image}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, image: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="version">Version</Label>
                  <Input
                    id="version"
                    placeholder="1.0.0"
                    value={formData.version}
                    onChange={e =>
                      setFormData(prev => ({
                        ...prev,
                        version: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="author">Author</Label>
                  <Input
                    id="author"
                    placeholder="Author name"
                    value={formData.author}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, author: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={v =>
                    setFormData(prev => ({ ...prev, category: v }))
                  }>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  placeholder="python, langchain, custom"
                  value={formData.tags}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, tags: e.target.value }))
                  }
                />
                <p className="text-muted-foreground text-xs">
                  Comma-separated list of tags
                </p>
              </div>

              <div className="space-y-4 rounded-lg border p-4">
                <h4 className="font-medium">Agent Template Implementation</h4>

                <div className="bg-muted/50 rounded-md p-3 text-sm">
                  <p className="text-muted-foreground">
                    Agent template implementations must adhere to specific
                    interface requirements.{' '}
                    <a
                      href="https://mckinsey.github.io/agents-at-scale-ark/docs/core-concepts/execution-engines"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1 hover:underline">
                      Learn more in the documentation
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                </div>
              </div>
            </>
          )}

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
          <Button onClick={handleSubmit} disabled={createItem.isPending}>
            {createItem.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {createItem.isPending ? 'Saving...' : 'Save to Marketplace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
