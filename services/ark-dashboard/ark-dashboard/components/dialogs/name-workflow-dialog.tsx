'use client';

import { useEffect, useState } from 'react';

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

interface NameWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => void;
}

export function NameWorkflowDialog({
  open,
  onOpenChange,
  onConfirm,
}: NameWorkflowDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setError(null);
    }
  }, [open]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Workflow name is required.');
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Name your workflow</DialogTitle>
          <DialogDescription>
            Give your workflow template a name to get started.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-2"
          onSubmit={event => {
            event.preventDefault();
            handleConfirm();
          }}>
          <Label htmlFor="workflow-name">Workflow name</Label>
          <Input
            id="workflow-name"
            value={name}
            autoFocus
            onChange={event => {
              setName(event.target.value);
              if (error) {
                setError(null);
              }
            }}
          />
          <p className="text-muted-foreground text-sm">
            You won&apos;t be able to rename it after creation.
          </p>
          {error && <p className="text-destructive text-sm">{error}</p>}

          <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" className="w-full sm:w-auto">
              Create workflow
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
