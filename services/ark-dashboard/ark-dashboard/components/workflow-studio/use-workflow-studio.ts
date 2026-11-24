'use client';

import yaml from 'js-yaml';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { useUnsavedChangesGuard } from '@/lib/hooks/use-navigation-guard';
import {
  WORKFLOW_TEMPLATE_ANNOTATIONS,
  type WorkflowTemplateSaveMode,
  workflowTemplatesService,
} from '@/lib/services/workflow-templates';
import { useNamespace } from '@/providers/NamespaceProvider';

export type WorkflowStudioMode = 'new' | 'edit';
export type WorkflowStudioView = 'diagram' | 'yaml';

export interface UseWorkflowStudioOptions {
  mode: WorkflowStudioMode;
  initialName?: string;
  initialTitle?: string;
  initialDescription?: string;
}

interface WorkflowMeta {
  title: string;
  description: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMetaFromYaml(yamlText: string): WorkflowMeta | null {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlText);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) {
    return null;
  }
  const annotations = isPlainObject(parsed.metadata)
    ? parsed.metadata.annotations
    : undefined;
  if (!isPlainObject(annotations)) {
    return { title: '', description: '' };
  }
  const title = annotations[WORKFLOW_TEMPLATE_ANNOTATIONS.TITLE];
  const description = annotations[WORKFLOW_TEMPLATE_ANNOTATIONS.DESCRIPTION];
  return {
    title: typeof title === 'string' ? title : '',
    description: typeof description === 'string' ? description : '',
  };
}

function applyMetaToMetadata(
  metadata: Record<string, unknown>,
  meta: WorkflowMeta,
): Record<string, unknown> {
  const existingAnnotations = isPlainObject(metadata.annotations)
    ? metadata.annotations
    : {};
  const annotations: Record<string, unknown> = { ...existingAnnotations };
  if (meta.title.trim()) {
    annotations[WORKFLOW_TEMPLATE_ANNOTATIONS.TITLE] = meta.title;
  } else {
    delete annotations[WORKFLOW_TEMPLATE_ANNOTATIONS.TITLE];
  }
  if (meta.description.trim()) {
    annotations[WORKFLOW_TEMPLATE_ANNOTATIONS.DESCRIPTION] = meta.description;
  } else {
    delete annotations[WORKFLOW_TEMPLATE_ANNOTATIONS.DESCRIPTION];
  }
  const next: Record<string, unknown> = { ...metadata };
  if (Object.keys(annotations).length > 0) {
    next.annotations = annotations;
  } else {
    delete next.annotations;
  }
  return next;
}

export interface WorkflowStudioState {
  mode: WorkflowStudioMode;
  workflowName: string;
  title: string;
  description: string;
  updateMeta: (title: string, description: string) => void;
  draftYaml: string;
  setDraftYaml: (value: string) => void;
  lastSavedYaml: string;
  lastAgentYaml: string | undefined;
  commitAgentYaml: (value: string) => void;
  isDirty: boolean;
  handEdited: boolean;
  setHandEdited: (value: boolean) => void;
  view: WorkflowStudioView;
  setView: (value: WorkflowStudioView) => void;
  building: boolean;
  setBuilding: (value: boolean) => void;
  loading: boolean;
  saving: boolean;
  isNameModalOpen: boolean;
  commitName: (name: string) => void;
  cancelNameModal: () => void;
  overwriteOpen: boolean;
  confirmOverwrite: () => Promise<void>;
  cancelOverwrite: () => void;
  save: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useWorkflowStudio({
  mode,
  initialName,
  initialTitle,
  initialDescription,
}: UseWorkflowStudioOptions): WorkflowStudioState {
  const { namespace } = useNamespace();
  const { push, replace } = useNamespacedNavigation();

  const [workflowName, setWorkflowName] = useState<string>(initialName ?? '');
  const [title, setTitle] = useState<string>(initialTitle ?? '');
  const [description, setDescription] = useState<string>(
    initialDescription ?? '',
  );
  const [draftYaml, setDraftYaml] = useState<string>('');
  const [lastSavedYaml, setLastSavedYaml] = useState<string>('');
  const [lastAgentYaml, setLastAgentYaml] = useState<string | undefined>(
    undefined,
  );
  const [handEdited, setHandEdited] = useState<boolean>(false);
  const [view, setView] = useState<WorkflowStudioView>('diagram');
  const [building, setBuilding] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(mode === 'edit');
  const [saving, setSaving] = useState<boolean>(false);
  const [isNameModalOpen, setIsNameModalOpen] = useState<boolean>(
    mode === 'new' && !initialName,
  );
  const [overwriteOpen, setOverwriteOpen] = useState<boolean>(false);
  const pendingYaml = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== 'edit' || !initialName) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    workflowTemplatesService
      .getYaml(namespace, initialName)
      .then(fetched => {
        if (cancelled) {
          return;
        }
        setDraftYaml(fetched);
        setLastSavedYaml(fetched);
        setLastAgentYaml(undefined);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        toast.error('Failed to load workflow', {
          description: errorMessage(error),
        });
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [namespace, mode, initialName]);

  useEffect(() => {
    if (!draftYaml.trim()) {
      return;
    }
    const meta = parseMetaFromYaml(draftYaml);
    if (!meta) {
      return;
    }
    setTitle(meta.title);
    setDescription(meta.description);
  }, [draftYaml]);

  const isDirty = draftYaml.trim() !== '' && draftYaml !== lastSavedYaml;

  const { bypass } = useUnsavedChangesGuard(isDirty);

  const commitAgentYaml = useCallback((value: string) => {
    setDraftYaml(value);
    setLastAgentYaml(value);
    setHandEdited(false);
  }, []);

  const commitName = useCallback((name: string) => {
    setWorkflowName(name);
    setIsNameModalOpen(false);
  }, []);

  const cancelNameModal = useCallback(() => {
    setIsNameModalOpen(false);
    push('/workflow-templates');
  }, [push]);

  const stampYaml = useCallback(
    (name: string): string | null => {
      let parsed: unknown;
      try {
        parsed = yaml.load(draftYaml);
      } catch (error) {
        toast.error(`Fix the YAML before saving: ${errorMessage(error)}`);
        return null;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        toast.error(
          'Fix the YAML before saving: expected a WorkflowTemplate mapping',
        );
        return null;
      }
      const resource: Record<string, unknown> = {
        ...(parsed as Record<string, unknown>),
      };
      const existingMetadata = isPlainObject(resource.metadata)
        ? resource.metadata
        : {};
      resource.metadata = applyMetaToMetadata(
        { ...existingMetadata, name },
        { title, description },
      );
      return yaml.dump(resource);
    },
    [draftYaml, title, description],
  );

  const updateMeta = useCallback(
    (nextTitle: string, nextDescription: string) => {
      setTitle(nextTitle);
      setDescription(nextDescription);
      if (!draftYaml.trim()) {
        return;
      }
      let parsed: unknown;
      try {
        parsed = yaml.load(draftYaml);
      } catch {
        return;
      }
      if (!isPlainObject(parsed)) {
        return;
      }
      const resource: Record<string, unknown> = { ...parsed };
      const existingMetadata = isPlainObject(resource.metadata)
        ? resource.metadata
        : {};
      resource.metadata = applyMetaToMetadata(existingMetadata, {
        title: nextTitle,
        description: nextDescription,
      });
      const next = yaml.dump(resource);
      if (next !== draftYaml) {
        setDraftYaml(next);
        setHandEdited(true);
      }
    },
    [draftYaml],
  );

  const performSave = useCallback(
    async (
      stamped: string,
      saveMode: WorkflowTemplateSaveMode,
      targetName: string,
      navigateToEdit: boolean,
    ) => {
      setSaving(true);
      try {
        await workflowTemplatesService.save(namespace, stamped, saveMode);
        setLastSavedYaml(draftYaml);
        setHandEdited(false);
        toast.success('Workflow saved', {
          description: targetName,
        });
        if (navigateToEdit) {
          bypass(() => replace(`/workflow-templates/${targetName}`));
        }
      } catch (error) {
        toast.error('Failed to save workflow', {
          description: errorMessage(error),
        });
      } finally {
        setSaving(false);
      }
    },
    [namespace, draftYaml, replace, bypass],
  );

  const save = useCallback(async () => {
    if (!draftYaml.trim() || building || saving) {
      return;
    }
    const stamped = stampYaml(workflowName);
    if (stamped === null) {
      return;
    }
    if (mode === 'new') {
      let exists = false;
      try {
        exists = await workflowTemplatesService.nameExists(
          namespace,
          workflowName,
        );
      } catch (error) {
        toast.error('Failed to save workflow', {
          description: errorMessage(error),
        });
        return;
      }
      if (exists) {
        pendingYaml.current = stamped;
        setOverwriteOpen(true);
        return;
      }
      await performSave(stamped, 'create', workflowName, true);
      return;
    }
    await performSave(stamped, 'update', workflowName, false);
  }, [namespace, draftYaml, building, saving, stampYaml, workflowName, mode, performSave]);

  const confirmOverwrite = useCallback(async () => {
    const stamped = pendingYaml.current;
    setOverwriteOpen(false);
    pendingYaml.current = null;
    if (stamped === null) {
      return;
    }
    await performSave(stamped, 'update', workflowName, true);
  }, [performSave, workflowName]);

  const cancelOverwrite = useCallback(() => {
    setOverwriteOpen(false);
    pendingYaml.current = null;
  }, []);

  return {
    mode,
    workflowName,
    title,
    description,
    updateMeta,
    draftYaml,
    setDraftYaml,
    lastSavedYaml,
    lastAgentYaml,
    commitAgentYaml,
    isDirty,
    handEdited,
    setHandEdited,
    view,
    setView,
    building,
    setBuilding,
    loading,
    saving,
    isNameModalOpen,
    commitName,
    cancelNameModal,
    overwriteOpen,
    confirmOverwrite,
    cancelOverwrite,
    save,
  };
}
