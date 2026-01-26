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
  const [paramValues, setParamValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    parameters.forEach(param => {
      initial[param.name] = param.value || param.default || '';
    });
    return initial;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onRun(
        parameters.length > 0 ? paramValues : undefined,
        workflowName || undefined,
      );
      setOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      setOpen(newOpen);
      if (newOpen) {
        setWorkflowName('');
        const initial: Record<string, string> = {};
        parameters.forEach(param => {
          initial[param.name] = param.value || param.default || '';
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
              {parameters.length > 0
                ? `Configure parameters for ${templateName}`
                : `Run workflow ${templateName}?`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="workflow-name">
                Workflow Name{' '}
                <span className="text-muted-foreground text-xs font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="workflow-name"
                value={workflowName}
                onChange={e => setWorkflowName(e.target.value)}
                placeholder="Auto-generated if not specified"
              />
            </div>
            {parameters.length > 0 &&
              parameters.map(param => (
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
                    placeholder={param.default || ''}
                  />
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Running...' : 'Run'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
