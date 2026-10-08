'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { WorkflowParameter } from '@/lib/services/workflow-templates';

interface RunWorkflowDialogProps {
  templateName: string;
  parameters?: WorkflowParameter[];
  onRun: (
    parameters?: Record<string, string>,
    workflowName?: string,
  ) => Promise<void>;
  /** Element that opens the dialog. Omit it when driving `open` directly. */
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function emptyParamValues(
  parameters: readonly WorkflowParameter[],
): Record<string, string> {
  return Object.fromEntries(parameters.map(param => [param.name, '']));
}

export function RunWorkflowDialog({
  templateName,
  parameters = [],
  onRun,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: Readonly<RunWorkflowDialogProps>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  };
  const [workflowName, setWorkflowName] = useState('');
  const [workflowNameError, setWorkflowNameError] = useState<string>('');
  const [paramValues, setParamValues] = useState<Record<string, string>>(() =>
    emptyParamValues(parameters),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setWorkflowName('');
      setWorkflowNameError('');
      setParamValues(emptyParamValues(parameters));
    }
  }

  const validateWorkflowName = (name: string): string => {
    if (!name) {
      return '';
    }

    if (name.length > 253) {
      return 'Name must be 253 characters or less';
    }

    const k8sNameRegex =
      /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
    if (!k8sNameRegex.test(name)) {
      return 'Name must be lowercase alphanumeric characters, "-" or ".", and must start and end with an alphanumeric character';
    }

    return '';
  };

  const handleWorkflowNameChange = (value: string) => {
    setWorkflowName(value);
    const error = validateWorkflowName(value);
    setWorkflowNameError(error);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nameError = validateWorkflowName(workflowName);
    if (nameError) {
      setWorkflowNameError(nameError);
      return;
    }

    setIsSubmitting(true);
    try {
      const nonEmptyParams = Object.fromEntries(
        Object.entries(paramValues).filter(([_, value]) => value.trim() !== ''),
      );
      await onRun(
        Object.keys(nonEmptyParams).length > 0 ? nonEmptyParams : undefined,
        workflowName || undefined,
      );
      setOpen(false);
    } catch (error) {
      console.error('Error in dialog, keeping dialog open:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      setOpen(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Run Workflow</DialogTitle>
            <DialogDescription>
              Configure and run {templateName}
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-1 grid max-h-[60vh] gap-4 overflow-y-auto px-1 py-4">
            <div className="grid gap-2">
              <Label htmlFor="workflow-name">Workflow name</Label>
              <Input
                id="workflow-name"
                value={workflowName}
                onChange={e => handleWorkflowNameChange(e.target.value)}
                placeholder="Auto-generated if not specified"
                aria-invalid={workflowNameError ? true : undefined}
                aria-describedby={
                  workflowNameError ? 'workflow-name-error' : undefined
                }
                disabled={isSubmitting}
              />
              {workflowNameError && (
                <p
                  id="workflow-name-error"
                  className="text-status-error text-sm">
                  {workflowNameError}
                </p>
              )}
            </div>
            {parameters.length > 0 && (
              <>
                <div className="mt-2 text-sm font-semibold">Parameters</div>
                {parameters.map(param => (
                  <div key={param.name} className="grid gap-2">
                    <Label htmlFor={param.name}>{param.name}</Label>
                    {param.description && (
                      <p className="text-fg-secondary text-xs">
                        {param.description}
                      </p>
                    )}
                    <Input
                      id={param.name}
                      value={paramValues[param.name] || ''}
                      onChange={e =>
                        setParamValues(prev => ({
                          ...prev,
                          [param.name]: e.target.value,
                        }))
                      }
                      placeholder={param.value || ''}
                      disabled={isSubmitting}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !!workflowNameError}
              className="min-w-[80px]">
              Run
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
