'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';

import { ParameterDetailPanel } from '@/components/panels/parameter-detail-panel';
import { SelectorDetailPanel } from '@/components/panels/selector-detail-panel';
import { Button } from '@/components/ui/button';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  type EvaluatorDetailResponse,
  type EvaluatorUpdateRequest,
  type Model,
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

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  address: z
    .string()
    .min(1, 'Address is required')
    .url('Address must be a valid URL'),
  modelRef: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

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
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [selector, setSelector] = useState<Selector | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [parametersError, setParametersError] = useState<string | undefined>();
  const [selectorError, setSelectorError] = useState<string | undefined>();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      address: '',
      modelRef: '',
    },
  });

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
      const addressSpec = evaluator.spec?.address as { value?: string };
      const modelRefSpec = evaluator.spec?.modelRef as { name?: string };

      form.reset({
        name: evaluator.name,
        description: (evaluator.spec?.description as string) || '',
        address: addressSpec?.value || '',
        modelRef: modelRefSpec?.name || '',
      });

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
  }, [evaluator, form]);

  const validateParametersAndSelector = (): boolean => {
    let isValid = true;
    setParametersError(undefined);
    setSelectorError(undefined);

    const paramNames = new Set();
    for (const param of parameters) {
      if (!param.name.trim()) {
        setParametersError('All parameters must have names');
        isValid = false;
        break;
      }
      if (paramNames.has(param.name)) {
        setParametersError(`Duplicate parameter name: ${param.name}`);
        isValid = false;
        break;
      }
      paramNames.add(param.name);
    }

    if (selector?.labelSelector?.matchLabels) {
      for (const [key] of Object.entries(selector.labelSelector.matchLabels)) {
        if (!key.trim()) {
          setSelectorError('Selector labels cannot have empty keys');
          isValid = false;
          break;
        }
      }
    }

    return isValid;
  };

  const onSubmit = async (values: FormValues) => {
    if (!validateParametersAndSelector()) {
      return;
    }

    const modelRefValue =
      values.modelRef && values.modelRef !== '__none__'
        ? values.modelRef
        : undefined;

    const evaluatorData: EvaluatorUpdateRequest = {
      description: values.description || undefined,
      address: {
        value: values.address,
      },
      ...(modelRefValue && { modelRef: { name: modelRefValue } }),
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
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          <div>
            <h1 className="mb-2 text-2xl font-semibold">Edit Evaluator</h1>
            <p className="text-muted-foreground">
              Update the evaluator configuration and parameters.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex w-full flex-col gap-3">
                <CardHeader className="w-full px-0">
                  <CardTitle className="text-lg">Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="w-full space-y-6 px-0">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={true} />
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
                            {...field}
                            placeholder="Describe what this evaluator does..."
                            rows={3}
                            disabled={saving}
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
                            {...field}
                            placeholder="http://evaluator-service:8080"
                            disabled={saving}
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
                          value={field.value || '__none__'}
                          onValueChange={value =>
                            field.onChange(value === '__none__' ? '' : value)
                          }
                          disabled={saving}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a model (optional)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-muted-foreground">
                                None
                              </span>
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
                </CardContent>
              </div>

              <hr />

              <SelectorDetailPanel
                selector={selector}
                onSelectorChange={setSelector}
                error={selectorError}
              />

              <div className="flex items-center justify-end gap-2 border-t pt-6">
                <Button type="submit" disabled={saving} className="min-w-24">
                  {saving ? (
                    <>
                      <Spinner size="sm" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={saving}>
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>

      <div className="bg-muted/30 max-h-screen w-96 overflow-hidden border-l">
        <ParameterDetailPanel
          parameters={parameters}
          onParametersChange={setParameters}
          error={parametersError}
        />
      </div>
    </div>
  );
}
