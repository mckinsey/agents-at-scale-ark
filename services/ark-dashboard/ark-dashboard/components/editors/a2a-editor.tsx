'use client';

import { useState } from 'react';
import { toast } from 'sonner';

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
import type { A2AServerConfiguration } from '@/lib/services/a2a-servers';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  namespace: string;
  onSave: (config: A2AServerConfiguration) => void;
};

export function A2AEditor({ open, onOpenChange, namespace, onSave }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [pollingInterval, setPollingInterval] = useState<number | ''>('');

  const isValid =
    Boolean(name.trim() && baseUrl.trim()) &&
    (pollingInterval === '' || !isNaN(Number(pollingInterval)));

  const handleSave = () => {
    if (!isValid) {
      toast.error('Please fill in required fields correctly');
      return;
    }

    const config: A2AServerConfiguration = {
      name,
      namespace,
      spec: {
        description: description || undefined,
        address: { value: baseUrl },
        pollingInterval:
          pollingInterval === '' ? undefined : Number(pollingInterval),
      },
    };

    onSave(config);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New A2A Server</DialogTitle>
          <DialogDescription>
            Fill in the information for the new A2A server.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Name */}
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., deep-research"
            />
          </div>

          {/* Description */}
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What this server does"
            />
          </div>

          {/* URL */}
          <div className="grid gap-2">
            <Label htmlFor="base-url">URL</Label>
            <Input
              id="base-url"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://agentspace-a2a.default.svc.cluster.local:2973/a2a/agent/..."
            />
          </div>

          {/* Polling Interval */}
          <div className="grid gap-2">
            <Label htmlFor="polling-interval">Polling Interval (seconds)</Label>
            <Input
              id="polling-interval"
              type="number"
              value={pollingInterval}
              onChange={e =>
                setPollingInterval(e.target.value ? Number(e.target.value) : '')
              }
              placeholder="e.g., 60"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
