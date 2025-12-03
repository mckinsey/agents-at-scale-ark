'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
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
  type Evaluator,
  type EvaluatorCreateRequest,
  type EvaluatorUpdateRequest,
  type Model,
  evaluatorsService,
  modelsService,
} from '@/lib/services';

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

interface EvaluatorEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluator: Evaluator | null;
  onSave: (
    evaluator: (EvaluatorCreateRequest | EvaluatorUpdateRequest) & {
      id?: string;
    },
  ) => void;
}

const formSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .regex(
      /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
      'Name must be a valid Kubernetes name (lowercase letters, numbers, and hyphens only)',
    ),
  description: z.string().optional(),
  address: z
    .string()
    .min(1, 'Address is required')
    .url('Address must be a valid URL'),
  modelRef: z.string().optional(),
});

export function EvaluatorEditor({
  open,
  onOpenChange,
  evaluator,
  onSave,
}: EvaluatorEditorProps) {
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [selector, setSelector] = useState<Selector | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [evaluatorLoading, setEvaluatorLoading] = useState(false);
  const isEditing = !!evaluator;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      address: '',
      modelRef: '',
    },
  });

  useEffect(() => {
    if (open) {
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
    }
  }, [open]);

  useEffect(() => {
    const loadEvaluatorDetails = async () => {
      if (evaluator && isEditing) {
        setEvaluatorLoading(true);
        try {
          const detailedEvaluator = await evaluatorsService.getDetailsByName(
            evaluator.name,
          );
          if (detailedEvaluator) {
            form.reset({
              name: detailedEvaluator.name,
              description:
                (detailedEvaluator.spec?.description as string) || '',
              address:
                (detailedEvaluator.spec?.address as { value?: string })
                  ?.value || '',
              modelRef:
                (detailedEvaluator.spec?.modelRef as { name?: string })?.name ||
                '',
            });

            const parametersSpec = detailedEvaluator.spec
              ?.parameters as Parameter[];
            setParameters(parametersSpec || []);

            const selectorSpec = detailedEvaluator.spec?.selector as Record<
              string,
              unknown
            >;
            if (selectorSpec) {
              if (
                selectorSpec.resourceType &&
                selectorSpec.matchLabels !== undefined
              ) {
                setSelector({
                  resource: selectorSpec.resourceType as string,
                  labelSelector: {
                    matchLabels:
                      (selectorSpec.matchLabels as Record<string, string>) ||
                      {},
                    matchExpressions:
                      (selectorSpec.matchExpressions as MatchExpression[]) ||
                      [],
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
        } catch (error) {
          toast.error('Failed to Load Evaluator Details', {
            description:
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred',
          });
          form.reset({
            name: evaluator.name,
            description: evaluator.description || '',
            address: evaluator.address || '',
            modelRef: '',
          });
          setParameters([]);
          setSelector(null);
        } finally {
          setEvaluatorLoading(false);
        }
      } else if (!evaluator) {
        form.reset();
        setParameters([]);
        setSelector(null);
      }
    };

    if (open) {
      loadEvaluatorDetails();
    }
  }, [evaluator, isEditing, open, form]);

  const addParameter = () => {
    setParameters([...parameters, { name: '', value: '' }]);
  };

  const removeParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  const updateParameter = (
    index: number,
    field: 'name' | 'value',
    value: string,
  ) => {
    const updated = [...parameters];
    updated[index][field] = value;
    setParameters(updated);
  };

  const addMatchLabel = () => {
    if (!selector) {
      setSelector({
        resource: 'Query',
        labelSelector: {
          matchLabels: { '': '' },
          matchExpressions: [],
        },
      });
    } else {
      setSelector({
        ...selector,
        labelSelector: {
          ...selector.labelSelector,
          matchLabels: { ...selector.labelSelector?.matchLabels, '': '' },
        },
      });
    }
  };

  const removeMatchLabel = (key: string) => {
    if (selector?.labelSelector?.matchLabels) {
      const { [key]: _removed, ...rest } = selector.labelSelector.matchLabels;
      setSelector({
        ...selector,
        labelSelector: {
          ...selector.labelSelector,
          matchLabels: rest,
        },
      });
    }
  };

  const updateMatchLabel = (oldKey: string, newKey: string, value: string) => {
    if (selector?.labelSelector?.matchLabels) {
      const { [oldKey]: _removed, ...rest } =
        selector.labelSelector.matchLabels;
      setSelector({
        ...selector,
        labelSelector: {
          ...selector.labelSelector,
          matchLabels: { ...rest, [newKey]: value },
        },
      });
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    // Validate parameters don't have duplicates
    const paramNames = new Set();
    for (const param of parameters) {
      if (!param.name || !param.name.trim()) {
        form.setError('name', {
          message: 'All parameters must have names',
        });
        return;
      }
      if (paramNames.has(param.name)) {
        form.setError('name', {
          message: `Duplicate parameter name: ${param.name}`,
        });
        return;
      }
      paramNames.add(param.name);
    }

    // Validate selector labels don't have empty keys
    if (selector?.labelSelector?.matchLabels) {
      for (const [key] of Object.entries(selector.labelSelector.matchLabels)) {
        if (!key.trim()) {
          form.setError('name', {
            message: 'Selector labels cannot have empty keys',
          });
          return;
        }
      }
    }

    const evaluatorData = {
      name: values.name,
      description: values.description || undefined,
      address: {
        value: values.address,
      },
      ...(values.modelRef && { modelRef: { name: values.modelRef } }),
      ...(parameters.length > 0 && { parameters }),
      ...(selector &&
        selector.labelSelector &&
        Object.keys(selector.labelSelector.matchLabels || {}).some(
          k => k && selector.labelSelector?.matchLabels?.[k],
        ) && { selector }),
      ...(isEditing && { id: evaluator.name }),
    };

    onSave(evaluatorData);
    onOpenChange(false);
    if (!isEditing) {
      form.reset();
      setParameters([]);
      setSelector(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Evaluator' : 'Create New Evaluator'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the evaluator configuration.'
              : 'Create a new evaluator to assess agent performance.'}
          </DialogDescription>
        </DialogHeader>

        {evaluatorLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="text-muted-foreground text-sm">
                Loading evaluator details...
              </div>
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="max-h-[60vh] space-y-4 overflow-y-auto">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Name <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="evaluator-name"
                          disabled={isEditing || form.formState.isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe what this evaluator does..."
                          disabled={form.formState.isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Address <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="http://evaluator-service:8080"
                          disabled={form.formState.isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="modelRef"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Model Reference (Optional)</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || '__none__'}
                        disabled={form.formState.isSubmitting}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a model (optional)" />
                          </SelectTrigger>
                        </FormControl>
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
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Parameters (Optional)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addParameter}
                      disabled={form.formState.isSubmitting}>
                      <Plus className="mr-1 h-4 w-4" />
                      Add Parameter
                    </Button>
                  </div>
                  {parameters.length > 0 && (
                    <div className="space-y-2 rounded-md border p-3">
                      {parameters.map((param, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            placeholder="Parameter name"
                            value={param.name}
                            onChange={e =>
                              updateParameter(index, 'name', e.target.value)
                            }
                            disabled={form.formState.isSubmitting}
                            className="flex-1"
                          />
                          <Input
                            placeholder="Parameter value"
                            value={param.value}
                            onChange={e =>
                              updateParameter(index, 'value', e.target.value)
                            }
                            disabled={form.formState.isSubmitting}
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeParameter(index)}
                            disabled={form.formState.isSubmitting}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Resource Selector (Optional)</Label>
                    <div className="flex gap-2">
                      {!selector && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSelector({
                              resource: 'Query',
                              labelSelector: {
                                matchLabels: {},
                                matchExpressions: [],
                              },
                            })
                          }
                          disabled={form.formState.isSubmitting}>
                          <Plus className="mr-1 h-4 w-4" />
                          Add Selector
                        </Button>
                      )}
                      {selector && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelector(null)}
                          disabled={form.formState.isSubmitting}>
                          <X className="mr-1 h-4 w-4" />
                          Remove Selector
                        </Button>
                      )}
                    </div>
                  </div>
                  {selector && (
                    <div className="space-y-3 rounded-md border p-3">
                      <div className="space-y-1">
                        <Label className="text-sm">Resource Type</Label>
                        <Select
                          value={selector.resource}
                          onValueChange={value =>
                            setSelector({ ...selector, resource: value })
                          }
                          disabled={form.formState.isSubmitting}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Query">Query</SelectItem>
                            <SelectItem value="Agent">Agent</SelectItem>
                            <SelectItem value="Model">Model</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Match Labels</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addMatchLabel}
                            disabled={form.formState.isSubmitting}>
                            <Plus className="mr-1 h-4 w-4" />
                            Add Label
                          </Button>
                        </div>
                        {Object.entries(
                          selector.labelSelector?.matchLabels || {},
                        ).map(([key, value], index) => (
                          <div
                            key={`label-${index}`}
                            className="flex items-center gap-2">
                            <Input
                              placeholder="Label key"
                              value={key}
                              onChange={e =>
                                updateMatchLabel(key, e.target.value, value)
                              }
                              disabled={form.formState.isSubmitting}
                              className="flex-1"
                            />
                            <Input
                              placeholder="Label value"
                              value={value}
                              onChange={e =>
                                updateMatchLabel(key, key, e.target.value)
                              }
                              disabled={form.formState.isSubmitting}
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeMatchLabel(key)}
                              disabled={form.formState.isSubmitting}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={form.formState.isSubmitting}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting || evaluatorLoading}>
                  {form.formState.isSubmitting
                    ? 'Saving...'
                    : isEditing
                      ? 'Update Evaluator'
                      : 'Create Evaluator'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
