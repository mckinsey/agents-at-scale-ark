'use client';

import { AlertCircle, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ParameterDetailPanel } from '@/components/panels/parameter-detail-panel';
import { SelectorDetailPanel } from '@/components/panels/selector-detail-panel';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  type EvaluatorDetailResponse,
  type EvaluatorUpdateRequest,
  type Model,
  modelsService,
} from '@/lib/services';

import { Button } from '../ui/button';

interface Parameter {
  name: string;
  value: string;
}

interface MatchExpression {
  key: string;
  operator: string;
  values: string[];
}

interface Selector {
  resource: string;
  labelSelector?: {
    matchLabels?: Record<string, string>;
    matchExpressions?: MatchExpression[];
  };
}

interface EvaluatorEditFormProps {
  evaluator: EvaluatorDetailResponse;
  namespace: string;
  onSave: (data: EvaluatorUpdateRequest) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

export function EvaluatorEditForm({
  evaluator,
  namespace,
  onSave,
  onCancel,
  saving,
}: EvaluatorEditFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [modelRef, setModelRef] = useState('');
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [selector, setSelector] = useState<Selector | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadModels = async () => {
      setModelsLoading(true);
      try {
        const modelsData = await modelsService.getAll();
        setModels(modelsData);
      } catch (error) {
        toast.error('Failed to Load Models', {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
      } finally {
        setModelsLoading(false);
      }
    };
    loadModels();
  }, [namespace]);

  useEffect(() => {
    if (evaluator) {
      setName(evaluator.name);
      setDescription((evaluator.spec?.description as string) || '');

      const addressSpec = evaluator.spec?.address as { value?: string };
      setAddress(addressSpec?.value || '');

      const modelRefSpec = evaluator.spec?.modelRef as { name?: string };
      setModelRef(modelRefSpec?.name || '');

      const parametersSpec = evaluator.spec?.parameters as Parameter[];
      setParameters(parametersSpec || []);

      const selectorSpec = evaluator.spec?.selector as Record<string, unknown>;
      if (selectorSpec) {
        if (
          selectorSpec.resourceType &&
          selectorSpec.matchLabels !== undefined
        ) {
          setSelector({
            resource: selectorSpec.resourceType as string,
            labelSelector: {
              matchLabels:
                (selectorSpec.matchLabels as Record<string, string>) || {},
              matchExpressions:
                (selectorSpec.matchExpressions as MatchExpression[]) || [],
            },
          });
        } else if (selectorSpec.resource) {
          setSelector(selectorSpec as unknown as Selector);
        } else {
          setSelector(null);
        }
      } else {
        setSelector(null);
      }
    }
  }, [evaluator]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!name.match(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)) {
      newErrors.name =
        'Name must be a valid Kubernetes name (lowercase letters, numbers, and hyphens only)';
    }

    if (!address.trim()) {
      newErrors.address = 'Address is required';
    } else {
      try {
        new URL(address);
      } catch {
        newErrors.address = 'Address must be a valid URL';
      }
    }

    // Validate parameters
    const paramNames = new Set();
    for (const param of parameters) {
      if (!param.name.trim()) {
        newErrors.parameters = 'All parameters must have names';
        break;
      }
      if (paramNames.has(param.name)) {
        newErrors.parameters = `Duplicate parameter name: ${param.name}`;
        break;
      }
      paramNames.add(param.name);
    }

    // Validate selector labels
    if (selector?.labelSelector?.matchLabels) {
      for (const [key] of Object.entries(selector.labelSelector.matchLabels)) {
        if (!key.trim()) {
          newErrors.selector = 'Selector labels cannot have empty keys';
          break;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    const evaluatorData: EvaluatorUpdateRequest = {
      description: description || undefined,
      address: {
        value: address,
      },
      ...(modelRef && { modelRef: { name: modelRef } }),
      ...(parameters.length > 0 && { parameters }),
      ...(selector &&
        selector.labelSelector &&
        Object.keys(selector.labelSelector.matchLabels || {}).some(
          k => k && selector.labelSelector?.matchLabels?.[k],
        ) && { selector }),
    };

    await onSave(evaluatorData);
  };

  return (
    <div className="flex h-full">
      {/* Main Form Panel - Left Side */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          <div>
            <h1 className="mb-2 text-2xl font-semibold">Edit Evaluator</h1>
            <p className="text-muted-foreground">
              Update the evaluator configuration and parameters.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3">
            <CardHeader className="w-full px-0">
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="w-full space-y-6 px-0">
              <div className="flex flex-col gap-1 space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={true}
                  className={errors.name ? 'border-destructive' : ''}
                />
                {errors.name && (
                  <div className="text-destructive flex items-center gap-1 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {errors.name}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe what this evaluator does..."
                  rows={3}
                />
              </div>

              <div className="flex flex-col gap-1 space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="http://evaluator-service:8080"
                  className={errors.address ? 'border-destructive' : ''}
                />
                {errors.address && (
                  <div className="text-destructive flex items-center gap-1 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {errors.address}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 space-y-2">
                <Label htmlFor="model">Model Reference (Optional)</Label>
                <Select
                  value={modelRef || '__none__'}
                  onValueChange={value =>
                    setModelRef(value === '__none__' ? '' : value)
                  }>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">None</span>
                    </SelectItem>
                    {modelsLoading ? (
                      <SelectItem value="__loading__" disabled>
                        Loading models...
                      </SelectItem>
                    ) : (
                      models.map(model => (
                        <SelectItem key={model.name} value={model.name}>
                          {model.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </div>

          <hr />

          <SelectorDetailPanel
            selector={selector}
            onSelectorChange={setSelector}
            error={errors.selector}
          />

          <div className="flex items-center justify-end gap-2 border-t pt-6">
            <Button
              onClick={handleSubmit}
              disabled={saving}
              className="min-w-24">
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      </div>

      {/* Parameters Detail Panel - Right Side */}
      <div className="bg-muted/30 max-h-screen w-96 overflow-hidden border-l">
        <ParameterDetailPanel
          parameters={parameters}
          onParametersChange={setParameters}
          error={errors.parameters}
        />
      </div>
    </div>
  );
}
