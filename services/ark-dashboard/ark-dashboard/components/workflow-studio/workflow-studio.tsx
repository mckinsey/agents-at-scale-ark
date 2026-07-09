'use client';

import {
  ChevronLeft,
  FileCode,
  Lock,
  Network,
  Play,
  TriangleAlert,
} from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import { WorkflowDagViewer } from '@/components/workflow-dag-viewer';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';
import { cn } from '@/lib/utils';
import { parseWorkflowParameters } from '@/lib/utils/parse-workflow-parameters';
import { validateWorkflowYaml } from '@/lib/utils/validate-workflow-yaml';
import { showWorkflowStartedToast } from '@/lib/utils/workflow-toast';
import { useNamespace } from '@/providers/NamespaceProvider';

import { StudioChatPanel } from './studio-chat-panel';
import { StudioHeaderActions } from './studio-header-actions';
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
          <DialogTitle>Name your workflow</DialogTitle>
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
          error instanceof Error
            ? error.message
            : 'An unknown error occurred',
      });
      throw error;
    }
  };

  const validation =
    studio.draftYaml.trim() === ''
      ? { ok: true as const }
      : validateWorkflowYaml(studio.draftYaml);
  const showYamlBanner = studio.view === 'yaml' && !validation.ok;
  const fixDisabled = studio.building || chat.isStreaming || gate.gated;

  const handleSave = async () => {
    await studio.save();
    gate.recheck();
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
              Workflows
            </NamespacedLink>
            <span>/</span>
            <span className="text-foreground truncate font-medium">
              {studio.workflowName || 'Untitled'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {studio.isDirty && (
              <Badge variant="secondary" data-testid="studio-dirty-badge">
                Unsaved changes
              </Badge>
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
                  Run workflow
                </Button>
              }
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 px-6 pt-2 pb-4">
          <h3 className="truncate text-lg font-semibold">
            {studio.workflowName || 'Untitled workflow'}
          </h3>
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

      <div className="flex min-h-0 flex-1">
        <div
          className="border-border flex w-2/5 min-w-0 shrink-0 flex-col border-r"
          data-testid="studio-chat-slot">
          <StudioChatPanel
            chat={chat}
            gated={gate.gated}
            agentMissing={gate.agentMissing}
            mcpMissing={gate.mcpMissing}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-border flex shrink-0 items-center justify-end border-b px-6 py-3">
            <ViewToggle view={studio.view} onChange={studio.setView} />
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-6">
            {studio.loading ? (
              <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                <Spinner />
                Loading workflow...
              </div>
            ) : studio.view === 'diagram' ? (
              studio.draftYaml.trim() === '' ? (
                <div
                  className="bg-muted text-muted-foreground flex h-full items-center justify-center rounded-md p-6 text-sm"
                  data-testid="studio-diagram-empty">
                  The workflow diagram will appear here.
                </div>
              ) : (
                <WorkflowDagViewer manifest={studio.draftYaml} />
              )
            ) : (
              <div className="relative flex h-full min-h-0 flex-col gap-3">
                {showYamlBanner && !validation.ok && (
                  <div
                    role="alert"
                    className="border-destructive/50 bg-destructive/10 text-destructive flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
                    data-testid="studio-yaml-banner">
                    <div className="flex items-start gap-2">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{validation.message}</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={fixDisabled}
                      onClick={() =>
                        void chat.sendMessage('Fix the YAML errors for me')
                      }
                      data-testid="studio-yaml-fix">
                      Fix for me
                    </Button>
                  </div>
                )}
                <div className="relative min-h-0 flex-1">
                  <Textarea
                    data-testid="studio-yaml-editor"
                    value={studio.draftYaml}
                    spellCheck={false}
                    readOnly={studio.building}
                    onChange={event => {
                      studio.setDraftYaml(event.target.value);
                      studio.setHandEdited(true);
                    }}
                    placeholder="Enter WorkflowTemplate YAML..."
                    className={cn(
                      'h-full min-h-[400px] w-full resize-none font-mono text-sm',
                    )}
                  />
                  {studio.building && (
                    <div
                      className="bg-background/70 text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 rounded-md text-sm backdrop-blur-[1px]"
                      data-testid="studio-build-lock">
                      <Lock className="h-4 w-4" />
                      Agent is building — editing locked
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

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
