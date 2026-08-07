'use client';

import { useEffect, useMemo, useState } from 'react';

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
import { Textarea } from '@/components/ui/textarea';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';

export interface NameWorkflowValues {
  name: string;
  title?: string;
  description?: string;
}

interface NameWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (values: NameWorkflowValues) => void;
}

const RFC_1123_LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

function getNameError(name: string, existingNames: string[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Workflow template name is required.';
  }
  if (trimmed.length > 63) {
    return 'Name must be 63 characters or less.';
  }
  if (!RFC_1123_LABEL.test(trimmed)) {
    return 'Name must be lowercase letters, numbers, and hyphens, and start and end with a letter or number.';
  }
  if (existingNames.includes(trimmed)) {
    return `A workflow template named "${trimmed}" already exists.`;
  }
  return null;
}

export function NameWorkflowDialog({
  open,
  onOpenChange,
  onConfirm,
}: Readonly<NameWorkflowDialogProps>) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [existingNames, setExistingNames] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setName('');
    setTitle('');
    setDescription('');
    setExistingNames([]);
    setTouched(false);

    let cancelled = false;
    workflowTemplatesService
      .list()
      .then(templates => {
        if (!cancelled) {
          setExistingNames(templates.map(template => template.metadata.name));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExistingNames([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const nameError = useMemo(
    () => getNameError(name, existingNames),
    [name, existingNames],
  );

  const handleConfirm = () => {
    if (nameError) {
      setTouched(true);
      return;
    }
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    onConfirm({
      name: name.trim(),
      title: trimmedTitle || undefined,
      description: trimmedDescription || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Name your workflow template</DialogTitle>
          <DialogDescription>
            You won&apos;t be able to rename it after creation.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault();
            handleConfirm();
          }}>
          <div className="space-y-2">
            <Label htmlFor="workflow-name">
              Workflow name <span className="text-status-error">*</span>
            </Label>
            <Input
              id="workflow-name"
              data-testid="workflow-name-input"
              value={name}
              autoFocus
              placeholder="e.g. data-ingestion-pipeline"
              aria-invalid={touched && nameError ? true : undefined}
              onChange={event => {
                setName(event.target.value);
                setTouched(true);
              }}
            />
            {touched && nameError && (
              <p
                className="text-status-error text-sm"
                data-testid="workflow-name-error">
                {nameError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="workflow-title">
              Workflow display name <span className="text-status-error">*</span>
            </Label>
            <Input
              id="workflow-title"
              data-testid="workflow-title-input"
              value={title}
              placeholder="e.g. Data Ingestion"
              onChange={event => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="workflow-description">Description</Label>
            <Textarea
              id="workflow-description"
              data-testid="workflow-description-input"
              value={description}
              placeholder="e.g. Conduct adverse media screening via web research"
              onChange={event => setDescription(event.target.value)}
            />
          </div>

          <DialogFooter className="flex-col-reverse gap-2 pt-2 sm:flex-row sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!!nameError}
              className="w-full sm:w-auto">
              Create workflow template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
