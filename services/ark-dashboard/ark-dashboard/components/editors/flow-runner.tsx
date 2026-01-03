'use client';

import { ExternalLink, Loader2, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { flowRunsService } from '@/lib/services/flows';
import type { Flow, FlowParameter, FlowRun } from '@/lib/types/flow';

interface FlowRunnerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flow: Flow | null;
}

export function FlowRunner({
  open,
  onOpenChange,
  flow,
}: Readonly<FlowRunnerProps>) {
  const [parameters, setParameters] = useState<FlowParameter[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [lastRun, setLastRun] = useState<FlowRun | null>(null);

  useEffect(() => {
    if (open && flow) {
      setParameters(flow.parameters.map(p => ({ ...p })));
      setLastRun(null);
    }
  }, [open, flow]);

  const handleParameterChange = (index: number, value: string) => {
    const updated = [...parameters];
    updated[index] = { ...updated[index], value };
    setParameters(updated);
  };

  const handleRun = async () => {
    if (!flow) return;

    setIsRunning(true);
    try {
      const run = await flowRunsService.run(flow, parameters);
      setLastRun(run);
      toast.success('Flow started successfully', {
        description: `Workflow ${run.name} is now running.`,
        action: {
          label: 'View in Argo',
          onClick: () => window.open(run.argoUrl, '_blank'),
        },
      });
    } catch (error) {
      console.error('Failed to run flow:', error);
      toast.error('Failed to start flow', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsRunning(false);
    }
  };

  if (!flow) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Run: {flow.name}
          </DialogTitle>
          <DialogDescription>
            Configure parameters and run this flow. You can override the default
            values below.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="text-muted-foreground text-sm">
            <span className="font-medium">Template:</span> {flow.templateName}
            <span className="mx-2">•</span>
            <span className="font-medium">Namespace:</span>{' '}
            {flow.templateNamespace}
          </div>

          {parameters.length > 0 ? (
            <div className="space-y-3">
              <Label>Parameters</Label>
              {parameters.map((param, index) => (
                <div key={param.name} className="grid gap-1">
                  <Label
                    htmlFor={`param-${index}`}
                    className="text-muted-foreground font-mono text-xs">
                    {param.name}
                  </Label>
                  <Input
                    id={`param-${index}`}
                    value={param.value}
                    onChange={e => handleParameterChange(index, e.target.value)}
                    placeholder={`Enter ${param.name}`}
                  />
                  {param.description && (
                    <p className="text-muted-foreground text-xs">
                      {param.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              This flow has no parameters to configure.
            </p>
          )}

          {lastRun && (
            <div className="bg-muted/50 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    Last run: {lastRun.name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Status: {lastRun.status}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(lastRun.argoUrl, '_blank')}>
                  <ExternalLink className="mr-1 h-4 w-4" />
                  View in Argo
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleRun} disabled={isRunning}>
            {isRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Flow
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
