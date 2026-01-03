'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { workflowTemplatesService } from '@/lib/services/flows';
import type { Flow, FlowParameter, WorkflowTemplate } from '@/lib/types/flow';
import { getKubernetesNameError } from '@/lib/utils/kubernetes-validation';

interface FlowEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flow?: Flow | null;
  onSave: (flow: Omit<Flow, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

export function FlowEditor({
  open,
  onOpenChange,
  flow,
  onSave,
}: Readonly<FlowEditorProps>) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateNamespace, setTemplateNamespace] = useState('argo-workflows');
  const [parameters, setParameters] = useState<FlowParameter[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [namespacesLoading, setNamespacesLoading] = useState(false);

  const isEditing = !!flow;

  const loadNamespaces = useCallback(async () => {
    setNamespacesLoading(true);
    try {
      const response = await fetch('/api/argo/namespaces');
      if (response.ok) {
        const data = await response.json();
        setNamespaces(data);
      }
    } catch (error) {
      console.error('Failed to load namespaces:', error);
      setNamespaces(['default', 'argo-workflows']);
    } finally {
      setNamespacesLoading(false);
    }
  }, []);

  const loadTemplates = useCallback(async (namespace: string) => {
    setTemplatesLoading(true);
    try {
      const data = await workflowTemplatesService.getAll(namespace);
      setTemplates(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadNamespaces();
      if (flow) {
        setName(flow.name);
        setDescription(flow.description || '');
        setTemplateName(flow.templateName);
        setTemplateNamespace(flow.templateNamespace);
        setParameters(flow.parameters);
        loadTemplates(flow.templateNamespace);
      } else {
        setName('');
        setDescription('');
        setTemplateName('');
        setTemplateNamespace('argo-workflows');
        setParameters([]);
        loadTemplates('argo-workflows');
      }
      setNameError(null);
    }
  }, [open, flow, loadNamespaces, loadTemplates]);

  const handleNamespaceChange = (namespace: string) => {
    setTemplateNamespace(namespace);
    setTemplateName('');
    setParameters([]);
    loadTemplates(namespace);
  };

  const handleTemplateChange = (selectedTemplate: string) => {
    setTemplateName(selectedTemplate);
    const template = templates.find(t => t.name === selectedTemplate);
    if (template) {
      setParameters(
        template.parameters.map(p => ({
          name: p.name,
          value: p.value || '',
          description: p.description,
        })),
      );
    }
  };

  const handleNameChange = (value: string) => {
    setName(value);
    const error = getKubernetesNameError(value);
    setNameError(error);
  };

  const handleParameterChange = (index: number, value: string) => {
    const updated = [...parameters];
    updated[index] = { ...updated[index], value };
    setParameters(updated);
  };

  const handleAddParameter = () => {
    setParameters([...parameters, { name: '', value: '' }]);
  };

  const handleRemoveParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  const handleParameterNameChange = (index: number, paramName: string) => {
    const updated = [...parameters];
    updated[index] = { ...updated[index], name: paramName };
    setParameters(updated);
  };

  const handleSave = () => {
    if (!name || nameError || !templateName) return;

    onSave({
      name,
      description: description || undefined,
      templateName,
      templateNamespace,
      parameters,
    });

    onOpenChange(false);
  };

  const isValid = name && !nameError && templateName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Flow' : 'Create Flow'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update flow configuration and default parameters.'
              : 'Select a workflow template to create a new flow.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="namespace">Namespace</Label>
            <Select
              value={templateNamespace}
              onValueChange={handleNamespaceChange}
              disabled={namespacesLoading || isEditing}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    namespacesLoading
                      ? 'Loading namespaces...'
                      : 'Select a namespace'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {namespaces.map(ns => (
                  <SelectItem key={ns} value={ns}>
                    {ns}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="template">Workflow Template</Label>
            <Select
              value={templateName}
              onValueChange={handleTemplateChange}
              disabled={templatesLoading || isEditing}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    templatesLoading
                      ? 'Loading templates...'
                      : templates.length === 0
                        ? 'No templates in this namespace'
                        : 'Select a template'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {templates.map(template => (
                  <SelectItem key={template.name} value={template.name}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templateName &&
              templates.find(t => t.name === templateName)?.description && (
                <p className="text-muted-foreground text-sm">
                  {templates.find(t => t.name === templateName)?.description}
                </p>
              )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="name">Flow Name</Label>
            <Input
              id="name"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="my-flow"
              disabled={isEditing}
            />
            {nameError && (
              <p className="text-destructive text-sm">{nameError}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this flow do?"
              rows={2}
            />
          </div>

          {parameters.length > 0 && (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Default Parameters</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddParameter}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {parameters.map((param, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={param.name}
                      onChange={e =>
                        handleParameterNameChange(index, e.target.value)
                      }
                      placeholder="Parameter name"
                      className="w-1/3 font-mono text-sm"
                    />
                    <Input
                      value={param.value}
                      onChange={e =>
                        handleParameterChange(index, e.target.value)
                      }
                      placeholder="Default value"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveParameter(index)}>
                      <Trash2 className="text-destructive h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {parameters.length === 0 && templateName && (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Parameters</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddParameter}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add Parameter
                </Button>
              </div>
              <p className="text-muted-foreground text-sm">
                No parameters defined. Add custom parameters or select a
                template with parameters.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {isEditing ? 'Save Changes' : 'Create Flow'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
