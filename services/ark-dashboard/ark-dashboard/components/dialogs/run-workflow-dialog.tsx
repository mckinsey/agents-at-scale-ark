'use client';

import { Play } from 'lucide-react';
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
  trigger?: React.ReactNode;
}

export function RunWorkflowDialog({
  templateName,
  parameters = [],
  onRun,
  trigger,
}: RunWorkflowDialogProps) {
  const [open, setOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowNameError, setWorkflowNameError] = useState<string>('');
  const [paramValues, setParamValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    parameters.forEach(param => {
      initial[param.name] = '';
    });
    return initial;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      if (newOpen) {
        setWorkflowName('');
        setWorkflowNameError('');
        const initial: Record<string, string> = {};
        parameters.forEach(param => {
          initial[param.name] = '';
        });
        setParamValues(initial);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 cursor-pointer p-0">
            <Play className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Run Workflow</DialogTitle>
            <DialogDescription>
              Configure and run {templateName}
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-4 overflow-y-auto py-4">
            <div className="grid gap-2">
              <Label htmlFor="workflow-name">Workflow Name </Label>
              <Input
                id="workflow-name"
                value={workflowName}
                onChange={e => handleWorkflowNameChange(e.target.value)}
                placeholder="Auto-generated if not specified"
                className={workflowNameError ? 'border-destructive' : ''}
                disabled={isSubmitting}
              />
              {workflowNameError && (
                <p className="text-destructive text-xs">{workflowNameError}</p>
              )}
            </div>
            {parameters.length > 0 && (
              <>
                <div className="mt-2 text-sm font-semibold">Parameters</div>
                {parameters.map(param => (
                  <div key={param.name} className="grid gap-2">
                    <Label htmlFor={param.name}>{param.name}</Label>
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
