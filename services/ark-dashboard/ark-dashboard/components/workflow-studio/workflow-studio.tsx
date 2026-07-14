'use client';

import { ChevronLeft, FileCode, Info, Network, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { RunWorkflowDialog } from '@/components/dialogs/run-workflow-dialog';
import { NamespacedLink } from '@/components/namespaced-link';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { WorkflowDagViewer } from '@/components/workflow-dag-viewer';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';
import { parseWorkflowParameters } from '@/lib/utils/parse-workflow-parameters';
import { validateWorkflowYaml } from '@/lib/utils/validate-workflow-yaml';
import { showWorkflowStartedToast } from '@/lib/utils/workflow-toast';
import { useNamespace } from '@/providers/NamespaceProvider';

import { StudioChatPanel } from './studio-chat-panel';
import { StudioHeaderActions } from './studio-header-actions';
import { StudioResizableBody } from './studio-resizable-body';
import { StudioYamlEditor } from './studio-yaml-editor';
import { useAuthorAgentGate } from './use-author-agent-gate';
import { useStudioChat } from './use-studio-chat';
import {
  type WorkflowStudioMode,
  type WorkflowStudioView,
  useWorkflowStudio,
} from './use-workflow-studio';

interface WorkflowStudioProps {
  mode: WorkflowStudioMode;
  initialName?: string;
}

interface NameModalProps {
  open: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

function NameModal({ open, onConfirm, onCancel }: NameModalProps) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) {
          onCancel();
        }
      }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Name your workflow template</DialogTitle>
          <DialogDescription>
            Choose a name for the workflow template. This cannot be changed
            later.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="workflow-name">Name</Label>
          <Input
            id="workflow-name"
            data-testid="workflow-name-input"
            value={name}
            autoFocus
            placeholder="my-workflow"
            onChange={event => setName(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && trimmed) {
                onConfirm(trimmed);
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!trimmed}
            onClick={() => onConfirm(trimmed)}
            data-testid="workflow-name-confirm">
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SaveAsNewNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => void;
}

function SaveAsNewNameDialog({
  open,
  onOpenChange,
  onConfirm,
}: SaveAsNewNameDialogProps) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) {
          setName('');
        }
        onOpenChange(next);
      }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as new name</DialogTitle>
          <DialogDescription>
            Save a copy of this workflow under a new template name.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="workflow-new-name">Name</Label>
          <Input
            id="workflow-new-name"
            data-testid="workflow-new-name-input"
            value={name}
            autoFocus
            placeholder="my-workflow-copy"
            onChange={event => setName(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!trimmed}
            onClick={() => onConfirm(trimmed)}
            data-testid="workflow-new-name-confirm">
            Save copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ViewToggleProps {
  view: WorkflowStudioView;
  onChange: (view: WorkflowStudioView) => void;
}

function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div className="border-border inline-flex items-center border">
      <Button
        type="button"
        variant={view === 'diagram' ? 'default' : 'ghost'}
        size="sm"
        className="rounded-none"
        onClick={() => onChange('diagram')}
        data-testid="studio-view-diagram">
        <Network className="mr-2 h-4 w-4" />
        Diagram
      </Button>
      <Button
        type="button"
        variant={view === 'yaml' ? 'default' : 'ghost'}
        size="sm"
        className="rounded-none"
        onClick={() => onChange('yaml')}
        data-testid="studio-view-yaml">
        <FileCode className="mr-2 h-4 w-4" />
        YAML
      </Button>
    </div>
  );
}

export function WorkflowStudio({ mode, initialName }: WorkflowStudioProps) {
  const studio = useWorkflowStudio({ mode, initialName });
  const gate = useAuthorAgentGate();
  const chat = useStudioChat({
    draftYaml: studio.draftYaml,
    lastAgentYaml: studio.lastAgentYaml,
    commitAgentYaml: studio.commitAgentYaml,
    building: studio.building,
    setBuilding: studio.setBuilding,
    isDirty: studio.isDirty,
    handEdited: studio.handEdited,
  });
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const { readOnlyMode } = useNamespace();

  const canSave = studio.isDirty && !studio.building && !studio.saving;

  const persisted =
    studio.mode === 'edit' || studio.lastSavedYaml.trim() !== '';
  const canRun =
    persisted && !studio.isDirty && !studio.building && !readOnlyMode;
  const runParameters = useMemo(
    () => parseWorkflowParameters(studio.draftYaml),
    [studio.draftYaml],
  );

  const handleRun = async (
    parameters?: Record<string, string>,
    runName?: string,
  ) => {
    try {
      const workflow = await workflowTemplatesService.run(
        studio.workflowName,
        parameters,
        runName,
      );
      showWorkflowStartedToast(workflow.metadata.name);
    } catch (error) {
      toast.error('Failed to start workflow', {
        description:
          error instanceof Error ? error.message : 'An unknown error occurred',
      });
      throw error;
    }
  };

  const validation =
    studio.draftYaml.trim() === ''
      ? { ok: true as const }
      : validateWorkflowYaml(studio.draftYaml);

  const handleSave = async () => {
    await studio.save();
  };

  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      <header className="border-border shrink-0 border-b">
        <div className="flex items-center justify-between gap-4 px-6 pt-4">
          <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-sm">
            <NamespacedLink
              href="/workflow-templates"
              className="hover:text-foreground flex items-center gap-1">
              <ChevronLeft className="h-4 w-4" />
              Workflow Templates
            </NamespacedLink>
            <span>/</span>
            <span className="text-foreground truncate font-medium">
              {studio.workflowName || 'New workflow'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {studio.isDirty && (
              <span
                className="text-muted-foreground flex items-center gap-2 text-sm"
                data-testid="studio-dirty-badge">
                <span className="bg-primary h-1.5 w-1.5 rounded-full" />
                Unsaved changes
              </span>
            )}
            {mode === 'edit' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSaveAsOpen(true)}
                data-testid="studio-save-as">
                Save as new name
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={!canSave}
              onClick={() => void handleSave()}
              data-testid="studio-save">
              Save changes
            </Button>
            {persisted ? (
              <RunWorkflowDialog
                templateName={studio.workflowName}
                parameters={runParameters}
                onRun={handleRun}
                trigger={
                  <Button
                    type="button"
                    disabled={!canRun}
                    data-testid="studio-run">
                    <Play className="mr-2 h-4 w-4" />
                    Run
                  </Button>
                }
              />
            ) : (
              <Button
                type="button"
                disabled={!canSave}
                onClick={() => void handleSave()}
                data-testid="studio-create">
                Create
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 px-6 pt-2 pb-4">
          <div className="flex items-center gap-1">
            <h3 className="text-lg font-semibold">Workflow studio</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="About Workflow studio">
                    <Info className="text-muted-foreground h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Describe a workflow in plain language and the argo-make-author
                  agent drafts an Argo WorkflowTemplate live. Edit the YAML or
                  diagram, then save.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div
            className="flex items-center gap-2"
            data-testid="studio-header-actions">
            <StudioHeaderActions
              workflowName={studio.workflowName}
              draftYaml={studio.draftYaml}
              persisted={persisted}
            />
          </div>
        </div>
      </header>

      <StudioResizableBody
        chat={
          <StudioChatPanel
            chat={chat}
            gated={gate.gated}
            agentMissing={gate.agentMissing}
            agentNotReady={gate.agentNotReady}
            mcpMissing={gate.mcpMissing}
            mcpNotReady={gate.mcpNotReady}
          />
        }
        canvas={
          <>
            <div className="absolute top-4 right-4 z-10">
              <ViewToggle view={studio.view} onChange={studio.setView} />
            </div>

            <div className="relative min-h-0 flex-1">
              {studio.loading ? (
                <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                  <Spinner />
                  Loading workflow...
                </div>
              ) : studio.view === 'diagram' ? (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundColor: 'var(--background)',
                    backgroundImage:
                      'radial-gradient(color-mix(in srgb, var(--foreground) 6%, transparent) 1px, transparent 1px)',
                    backgroundSize: '22px 22px',
                  }}>
                  {studio.draftYaml.trim() === '' ? (
                    <div
                      className="text-muted-foreground absolute top-12 left-1/2 -translate-x-1/2 text-sm"
                      data-testid="studio-diagram-empty">
                      The workflow diagram will appear here.
                    </div>
                  ) : (
                    <WorkflowDagViewer manifest={studio.draftYaml} fill />
                  )}
                </div>
              ) : (
                <StudioYamlEditor
                  value={studio.draftYaml}
                  onChange={value => {
                    studio.setDraftYaml(value);
                    studio.setHandEdited(true);
                  }}
                  readOnly={studio.building}
                  error={
                    validation.ok ? undefined : { message: validation.message }
                  }
                />
              )}
            </div>
          </>
        }
      />

      <NameModal
        open={studio.isNameModalOpen}
        onConfirm={studio.commitName}
        onCancel={studio.cancelNameModal}
      />

      <SaveAsNewNameDialog
        open={saveAsOpen}
        onOpenChange={setSaveAsOpen}
        onConfirm={name => {
          setSaveAsOpen(false);
          studio.saveAsNewName(name);
        }}
      />

      <AlertDialog open={studio.overwriteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite existing workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              A workflow template named &quot;{studio.workflowName}&quot;
              already exists. Saving will overwrite it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={studio.cancelOverwrite}
              data-testid="studio-overwrite-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={studio.confirmOverwrite}
              data-testid="studio-overwrite-confirm">
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
