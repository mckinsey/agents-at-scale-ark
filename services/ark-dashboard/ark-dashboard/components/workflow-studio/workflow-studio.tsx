'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { RunWorkflowDialog } from '@/components/dialogs/run-workflow-dialog';
import {
  AccountTree,
  ChevronLeft,
  Code,
  Edit,
  PlayArrow,
  SaveAlt,
} from '@/components/icons';
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
import { Textarea } from '@/components/ui/textarea';
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
import { renderWorkflowDagSvg } from '@/lib/utils/workflow-dag-svg';
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
  initialTitle?: string;
  initialDescription?: string;
}

interface EditMetaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  title: string;
  description: string;
  onSave: (title: string, description: string) => void;
}

function EditMetaDialog({
  open,
  onOpenChange,
  name,
  title,
  description,
  onSave,
}: Readonly<EditMetaDialogProps>) {
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDescription, setDraftDescription] = useState(description);

  useEffect(() => {
    if (open) {
      setDraftTitle(title);
      setDraftDescription(description);
    }
  }, [open, title, description]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Workflow details</DialogTitle>
          <DialogDescription>
            Update the display title and description for this workflow template.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="workflow-meta-name">Workflow name</Label>
            <Input
              id="workflow-meta-name"
              data-testid="studio-name-input"
              value={name}
              disabled
              readOnly
            />
            <p className="text-fg-secondary text-xs">
              You&apos;re not able to rename workflow after creation.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="workflow-meta-title">
              Workflow display name <span className="text-status-error">*</span>
            </Label>
            <Input
              id="workflow-meta-title"
              data-testid="studio-title-input"
              value={draftTitle}
              autoFocus
              placeholder="Adverse media screening"
              onChange={event => setDraftTitle(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="workflow-meta-description">Description</Label>
            <Textarea
              id="workflow-meta-description"
              data-testid="studio-description-input"
              value={draftDescription}
              placeholder="Describe what this workflow does"
              onChange={event => setDraftDescription(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave(draftTitle, draftDescription)}
            data-testid="studio-meta-save">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface NameModalProps {
  open: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

function NameModal({ open, onConfirm, onCancel }: Readonly<NameModalProps>) {
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
          <Label htmlFor="workflow-name">Workflow name</Label>
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

interface ViewToggleProps {
  view: WorkflowStudioView;
  onChange: (view: WorkflowStudioView) => void;
}

function ViewToggle({ view, onChange }: Readonly<ViewToggleProps>) {
  return (
    <div className="border-stroke-divider inline-flex items-center border">
      <Button
        type="button"
        variant={view === 'diagram' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onChange('diagram')}
        data-testid="studio-view-diagram">
        <AccountTree className="mr-2 h-4 w-4" />
        Diagram
      </Button>
      <Button
        type="button"
        variant={view === 'yaml' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onChange('yaml')}
        data-testid="studio-view-yaml">
        <Code className="mr-2 h-4 w-4" />
        YAML
      </Button>
    </div>
  );
}

export function WorkflowStudio({
  mode,
  initialName,
  initialTitle,
  initialDescription,
}: Readonly<WorkflowStudioProps>) {
  const studio = useWorkflowStudio({
    mode,
    initialName,
    initialTitle,
    initialDescription,
  });
  const gate = useAuthorAgentGate();
  const { namespace, readOnlyMode } = useNamespace();
  const chatSessionId = studio.workflowName
    ? `argo-make-${namespace}-${studio.workflowName}`
    : undefined;
  const chat = useStudioChat({
    draftYaml: studio.draftYaml,
    lastAgentYaml: studio.lastAgentYaml,
    commitAgentYaml: studio.commitAgentYaml,
    building: studio.building,
    setBuilding: studio.setBuilding,
    isDirty: studio.isDirty,
    handEdited: studio.handEdited,
    sessionId: chatSessionId,
    resumeConversation: studio.mode === 'edit',
  });
  const [editMetaOpen, setEditMetaOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const baseFileName = studio.workflowName || 'workflow';

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const downloadYaml = () => {
    downloadBlob(
      new Blob([studio.draftYaml], { type: 'text/yaml' }),
      `${baseFileName}.yaml`,
    );
  };

  const downloadDiagram = (): boolean => {
    const svg = renderWorkflowDagSvg(studio.draftYaml);
    if (!svg) {
      toast.error('Unable to export diagram', {
        description:
          'Fix the workflow definition before exporting the diagram.',
      });
      return false;
    }
    downloadBlob(
      new Blob([svg], { type: 'image/svg+xml' }),
      `${baseFileName}.svg`,
    );
    return true;
  };

  const handleDownloadYaml = () => {
    if (!studio.draftYaml.trim()) {
      return;
    }
    downloadYaml();
    setDownloadOpen(false);
  };

  const handleDownloadDiagram = () => {
    if (!studio.draftYaml.trim()) {
      return;
    }
    if (downloadDiagram()) {
      setDownloadOpen(false);
    }
  };

  const handleDownloadBoth = () => {
    if (!studio.draftYaml.trim()) {
      return;
    }
    if (downloadDiagram()) {
      downloadYaml();
      setDownloadOpen(false);
    }
  };

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
      <header className="border-stroke-divider shrink-0 border-b">
        <div className="flex items-center justify-between gap-4 px-6 pt-4">
          <div className="text-fg-secondary flex min-w-0 items-center gap-1 text-sm">
            <NamespacedLink
              href="/workflow-templates"
              className="hover:text-fg-primary flex items-center gap-1">
              <ChevronLeft className="h-4 w-4" />
              Workflow Templates
            </NamespacedLink>
            <span>/</span>
            <span className="text-fg-primary truncate font-medium">
              Workflow Studio
            </span>
          </div>
          <div className="flex items-center gap-3">
            {studio.isDirty && (
              <span
                className="text-fg-secondary flex items-center gap-2 text-sm"
                data-testid="studio-dirty-badge">
                <span className="bg-fill-active h-1.5 w-1.5" />
                Unsaved changes
              </span>
            )}
            <Button
              type="button"
              variant={persisted ? 'outline' : 'default'}
              disabled={!canSave}
              onClick={() => void handleSave()}
              data-testid="studio-save">
              {persisted ? 'Save changes' : 'Create'}
            </Button>
            {persisted && (
              <RunWorkflowDialog
                templateName={studio.workflowName}
                parameters={runParameters}
                onRun={handleRun}
                trigger={
                  <Button
                    type="button"
                    disabled={!canRun}
                    data-testid="studio-run">
                    <PlayArrow className="mr-2 h-4 w-4" />
                    Run workflow
                  </Button>
                }
              />
            )}
          </div>
        </div>
        <div className="flex items-start justify-between gap-4 px-6 pt-3 pb-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1
                className="truncate text-2xl font-semibold"
                data-testid="studio-title">
                {studio.title.trim() || studio.workflowName || 'New workflow'}
              </h1>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label="Edit workflow details"
                      onClick={() => setEditMetaOpen(true)}
                      data-testid="studio-edit-meta">
                      <Edit className="text-fg-secondary h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit workflow details</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {studio.description.trim() && (
              <p
                className="text-fg-secondary max-w-[600px] truncate text-sm"
                data-testid="studio-description">
                {studio.description}
              </p>
            )}
            {studio.title.trim() && studio.workflowName && (
              <span
                className="text-fg-secondary truncate font-mono text-xs"
                data-testid="studio-name">
                {studio.workflowName}
              </span>
            )}
          </div>
          <div
            className="flex items-center gap-2"
            data-testid="studio-header-actions">
            <StudioHeaderActions
              workflowName={studio.workflowName}
              persisted={persisted}
            />
          </div>
        </div>
      </header>

      <StudioResizableBody
        chat={
          <StudioChatPanel
            chat={chat}
            loading={gate.loading || chat.historyLoading}
            gated={gate.gated}
            agentMissing={gate.agentMissing}
            agentNotReady={gate.agentNotReady}
            mcpMissing={gate.mcpMissing}
            mcpNotReady={gate.mcpNotReady}
            unverifiable={gate.unverifiable}
          />
        }
        canvas={
          <>
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
              <ViewToggle view={studio.view} onChange={studio.setView} />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Download workflow"
                      disabled={!studio.draftYaml.trim()}
                      onClick={() => setDownloadOpen(true)}
                      data-testid="studio-download">
                      <SaveAlt className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="relative min-h-0 flex-1">
              {studio.loading ? (
                <div className="text-fg-secondary flex h-full items-center justify-center gap-2 text-sm">
                  <Spinner />
                  Loading workflow...
                </div>
              ) : studio.view === 'diagram' ? (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundColor: 'var(--color-background)',
                    backgroundImage:
                      'radial-gradient(color-mix(in srgb, var(--color-fg-primary) 6%, transparent) 1px, transparent 1px)',
                    backgroundSize: '22px 22px',
                  }}>
                  {studio.draftYaml.trim() === '' ? (
                    <div
                      className="text-fg-secondary absolute top-16 left-1/2 -translate-x-1/2 text-sm"
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

      <EditMetaDialog
        open={editMetaOpen}
        onOpenChange={setEditMetaOpen}
        name={studio.workflowName}
        title={studio.title}
        description={studio.description}
        onSave={(nextTitle, nextDescription) => {
          studio.updateMeta(nextTitle, nextDescription);
          setEditMetaOpen(false);
        }}
      />

      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Download workflow</DialogTitle>
            <DialogDescription>
              Export the current workflow definition.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start py-3"
              disabled={!studio.draftYaml.trim()}
              onClick={handleDownloadYaml}
              data-testid="studio-download-yaml">
              <SaveAlt className="mr-2 h-4 w-4" />
              <div className="flex flex-col items-start">
                <span>YAML</span>
                <span className="text-fg-secondary text-xs">
                  Download the workflow template as a .yaml file
                </span>
              </div>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start py-3"
              disabled={!studio.draftYaml.trim()}
              onClick={handleDownloadDiagram}
              data-testid="studio-download-diagram">
              <SaveAlt className="mr-2 h-4 w-4" />
              <div className="flex flex-col items-start">
                <span>Diagram</span>
                <span className="text-fg-secondary text-xs">
                  Download the workflow diagram as a .svg image
                </span>
              </div>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start py-3"
              disabled={!studio.draftYaml.trim()}
              onClick={handleDownloadBoth}
              data-testid="studio-download-both">
              <SaveAlt className="mr-2 h-4 w-4" />
              <div className="flex flex-col items-start">
                <span>Both</span>
                <span className="text-fg-secondary text-xs">
                  Download the YAML and the diagram together
                </span>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDownloadOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NameModal
        open={studio.isNameModalOpen}
        onConfirm={studio.commitName}
        onCancel={studio.cancelNameModal}
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
