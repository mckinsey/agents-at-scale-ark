'use client';

import { ArrowUpRight, GitBranch, Plus } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { toast } from 'sonner';

import { FlowCard } from '@/components/cards/flow-card';
import { FlowEditor } from '@/components/editors/flow-editor';
import { FlowRunner } from '@/components/editors/flow-runner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useDelayedLoading } from '@/lib/hooks/use-delayed-loading';
import {
  checkArgoAvailable,
  flowsService,
  getArgoBaseUrl,
} from '@/lib/services/flows';
import type { Flow } from '@/lib/types/flow';

const ARGO_DOCS_URL =
  'https://github.com/mckinsey/agents-at-scale/tree/main/services/argo-workflows';

export interface FlowsSectionRef {
  openAddEditor: () => void;
}

export const FlowsSection = forwardRef<FlowsSectionRef>(
  function FlowsSection(_props, ref) {
    const [flows, setFlows] = useState<Flow[]>([]);
    const [loading, setLoading] = useState(true);
    const showLoading = useDelayedLoading(loading);
    const [argoBaseUrl, setArgoBaseUrl] = useState('http://localhost:2746');
    const [argoAvailable, setArgoAvailable] = useState<boolean | null>(null);

    const [editorOpen, setEditorOpen] = useState(false);
    const [editingFlow, setEditingFlow] = useState<Flow | null>(null);

    const [runnerOpen, setRunnerOpen] = useState(false);
    const [runningFlow, setRunningFlow] = useState<Flow | null>(null);

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deletingFlow, setDeletingFlow] = useState<Flow | null>(null);

    const loadFlows = useCallback(async () => {
      setLoading(true);
      try {
        const data = await flowsService.getAll();
        setFlows(data);
      } catch (error) {
        console.error('Failed to load flows:', error);
        toast.error('Failed to load flows');
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => {
      const init = async () => {
        const available = await checkArgoAvailable();
        setArgoAvailable(available);
        if (available) {
          loadFlows();
          getArgoBaseUrl().then(setArgoBaseUrl);
        } else {
          setLoading(false);
        }
      };
      init();
    }, [loadFlows]);

    useImperativeHandle(ref, () => ({
      openAddEditor: () => {
        setEditingFlow(null);
        setEditorOpen(true);
      },
    }));

    const handleSave = async (
      flowData: Omit<Flow, 'id' | 'createdAt' | 'updatedAt'>,
    ) => {
      try {
        if (editingFlow) {
          await flowsService.update(editingFlow.id, flowData);
          toast.success('Flow updated');
        } else {
          await flowsService.create(flowData);
          toast.success('Flow created');
        }
        loadFlows();
      } catch (error) {
        console.error('Failed to save flow:', error);
        toast.error('Failed to save flow');
      }
    };

    const handleEdit = (flow: Flow) => {
      setEditingFlow(flow);
      setEditorOpen(true);
    };

    const handleRun = (flow: Flow) => {
      setRunningFlow(flow);
      setRunnerOpen(true);
    };

    const handleDeleteClick = (flow: Flow) => {
      setDeletingFlow(flow);
      setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
      if (!deletingFlow) return;

      try {
        await flowsService.delete(deletingFlow.id);
        toast.success('Flow deleted');
        loadFlows();
      } catch (error) {
        console.error('Failed to delete flow:', error);
        toast.error('Failed to delete flow');
      } finally {
        setDeleteDialogOpen(false);
        setDeletingFlow(null);
      }
    };

    if (showLoading) {
      return (
        <div className="flex h-64 items-center justify-center">
          <div className="text-muted-foreground">Loading flows...</div>
        </div>
      );
    }

    if (argoAvailable === false) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitBranch className="h-10 w-10" />
            </EmptyMedia>
            <EmptyTitle>Argo Workflows Not Available</EmptyTitle>
            <EmptyDescription>
              Flows require Argo Workflows to be deployed in your cluster. Once
              Argo is installed, you can create and run workflow-based flows.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" asChild>
              <a href={ARGO_DOCS_URL} target="_blank" rel="noopener noreferrer">
                View Argo Setup Documentation
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </EmptyContent>
        </Empty>
      );
    }

    if (flows.length === 0) {
      return (
        <>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GitBranch className="h-10 w-10" />
              </EmptyMedia>
              <EmptyTitle>No Flows Yet</EmptyTitle>
              <EmptyDescription>
                Flows are saved workflow configurations that you can run with
                custom parameters. Create a flow from an Argo workflow template
                to get started.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setEditorOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Flow
              </Button>
            </EmptyContent>
            <Button variant="link" asChild>
              <a
                href={`${argoBaseUrl}/workflow-templates`}
                target="_blank"
                rel="noopener noreferrer">
                View Workflow Templates in Argo
                <ArrowUpRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
          </Empty>

          <FlowEditor
            open={editorOpen}
            onOpenChange={setEditorOpen}
            flow={editingFlow}
            onSave={handleSave}
          />
        </>
      );
    }

    return (
      <>
        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {flows.map(flow => (
            <FlowCard
              key={flow.id}
              flow={flow}
              onRun={handleRun}
              onEdit={handleEdit}
              onDelete={handleDeleteClick}
            />
          ))}
        </div>

        <FlowEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          flow={editingFlow}
          onSave={handleSave}
        />

        <FlowRunner
          open={runnerOpen}
          onOpenChange={setRunnerOpen}
          flow={runningFlow}
        />

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Flow</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{deletingFlow?.name}
                &quot;? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  },
);
