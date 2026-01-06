'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ExternalLink, Info, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
  FormDescription,
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
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AgentCreateRequest, Model } from '@/lib/services';
import { executionEnginesService } from '@/lib/services/execution-engines';
import type {
  ExecutionEngine,
  ExecutionEngineDetail,
  JsonSchemaProperty,
} from '@/lib/types/execution-engine';
import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

interface AdvancedAgentEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: Model[];
  onSave: (agent: AgentCreateRequest) => void;
  onBack?: () => void;
}

const baseFormSchema = z.object({
  name: kubernetesNameSchema,
  description: z.string().optional(),
  selectedModelName: z.string().optional(),
  selectedModelNamespace: z.string().optional(),
  executionEngineName: z.string().min(1, 'Please select a template'),
});

export function AdvancedAgentEditor({
  open,
  onOpenChange,
  models,
  onSave,
  onBack,
}: Readonly<AdvancedAgentEditorProps>) {
  const [engines, setEngines] = useState<ExecutionEngine[]>([]);
  const [selectedEngineDetail, setSelectedEngineDetail] =
    useState<ExecutionEngineDetail | null>(null);
  const [enginesLoading, setEnginesLoading] = useState(false);
  const [engineDetailLoading, setEngineDetailLoading] = useState(false);
  const [configValues, setConfigValues] = useState<Record<string, unknown>>({});

  const form = useForm<z.infer<typeof baseFormSchema>>({
    resolver: zodResolver(baseFormSchema),
    defaultValues: {
      name: '',
      description: '',
      selectedModelName: '__none__',
      selectedModelNamespace: '',
      executionEngineName: '',
    },
  });

  useEffect(() => {
    if (open) {
      const loadEngines = async () => {
        setEnginesLoading(true);
        try {
          const agenticEngines =
            await executionEnginesService.getAgenticEngines();
          setEngines(agenticEngines);
        } catch (error) {
          console.error('Failed to load execution engines:', error);
          setEngines([]);
        } finally {
          setEnginesLoading(false);
        }
      };
      loadEngines();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      form.reset();
      setSelectedEngineDetail(null);
      setConfigValues({});
    }
  }, [open, form]);

  const handleEngineChange = async (engineName: string) => {
    form.setValue('executionEngineName', engineName);
    setConfigValues({});

    if (!engineName) {
      setSelectedEngineDetail(null);
      return;
    }

    setEngineDetailLoading(true);
    try {
      const detail = await executionEnginesService.getById(engineName);
      setSelectedEngineDetail(detail);

      if (detail.configSchema?.properties) {
        const defaults: Record<string, unknown> = {};
        Object.entries(detail.configSchema.properties).forEach(
          ([key, prop]) => {
            if (prop.default !== undefined) {
              defaults[key] = prop.default;
            }
          },
        );
        setConfigValues(defaults);
      }
    } catch (error) {
      console.error('Failed to load execution engine details:', error);
      setSelectedEngineDetail(null);
    } finally {
      setEngineDetailLoading(false);
    }
  };

  const handleConfigChange = (key: string, value: unknown) => {
    setConfigValues(prev => ({ ...prev, [key]: value }));
  };

  const validateConfig = (): string[] => {
    const errors: string[] = [];
    const schema = selectedEngineDetail?.configSchema;

    if (!schema?.properties) return errors;

    const required = schema.required || [];

    required.forEach(key => {
      const value = configValues[key];
      if (value === undefined || value === null || value === '') {
        const prop = schema.properties![key];
        errors.push(`${prop.title || key} is required`);
      }
    });

    Object.entries(schema.properties).forEach(([key, prop]) => {
      const value = configValues[key];
      if (value === undefined || value === null || value === '') return;

      if (prop.type === 'string' && typeof value === 'string') {
        if (prop.minLength && value.length < prop.minLength) {
          errors.push(
            `${prop.title || key} must be at least ${prop.minLength} characters`,
          );
        }
        if (prop.maxLength && value.length > prop.maxLength) {
          errors.push(
            `${prop.title || key} must be at most ${prop.maxLength} characters`,
          );
        }
        if (prop.pattern) {
          const regex = new RegExp(prop.pattern);
          if (!regex.test(value)) {
            errors.push(`${prop.title || key} has invalid format`);
          }
        }
      }

      if (prop.type === 'number' || prop.type === 'integer') {
        const numValue = Number(value);
        if (prop.minimum !== undefined && numValue < prop.minimum) {
          errors.push(`${prop.title || key} must be at least ${prop.minimum}`);
        }
        if (prop.maximum !== undefined && numValue > prop.maximum) {
          errors.push(`${prop.title || key} must be at most ${prop.maximum}`);
        }
      }
    });

    return errors;
  };

  const onSubmit = (values: z.infer<typeof baseFormSchema>) => {
    const configErrors = validateConfig();
    if (configErrors.length > 0) {
      configErrors.forEach(error => {
        form.setError('root', { message: error });
      });
      return;
    }

    const createData: AgentCreateRequest = {
      name: values.name,
      description: values.description || undefined,
      modelRef:
        values.selectedModelName &&
        values.selectedModelName !== '' &&
        values.selectedModelName !== '__none__'
          ? {
              name: values.selectedModelName,
              namespace: values.selectedModelNamespace || undefined,
            }
          : undefined,
      executionEngine: {
        name: values.executionEngineName,
      },
      config: Object.fromEntries(
        Object.entries(configValues)
          .filter(([, value]) => value !== undefined && value !== '')
          .map(([key, value]) => [key, String(value)]),
      ),
    };

    onSave(createData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Advanced Agent</DialogTitle>
          <DialogDescription>
            Build an agent using a template implementation with custom
            configuration.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 py-4">
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
                        placeholder="e.g., my-custom-agent"
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
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., A custom agent for specific tasks"
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
                name="executionEngineName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Template Implementation{' '}
                      <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={handleEngineChange}
                      value={field.value}
                      disabled={form.formState.isSubmitting || enginesLoading}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              enginesLoading
                                ? 'Loading templates...'
                                : 'Select a template'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {engines.length === 0 && !enginesLoading ? (
                          <div className="text-muted-foreground p-2 text-center text-sm">
                            No templates available
                          </div>
                        ) : (
                          engines.map(engine => (
                            <SelectItem key={engine.name} value={engine.name}>
                              <div className="flex flex-col">
                                <span>{engine.name}</span>
                                {engine.description && (
                                  <span className="text-muted-foreground text-xs">
                                    {engine.description}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription className="flex items-center gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-help items-center gap-1">
                              <Info className="h-3 w-3" />
                              Add more options in the Marketplace
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              Install additional agent templates from the
                              Marketplace
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Link
                        href="/marketplace"
                        className="text-primary inline-flex items-center gap-1 hover:underline">
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {engineDetailLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                </div>
              )}

              {selectedEngineDetail?.configSchema?.properties &&
                !engineDetailLoading && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <h4 className="text-sm font-medium">
                      Template Configuration
                    </h4>
                    <ConfigSchemaForm
                      schema={selectedEngineDetail.configSchema}
                      values={configValues}
                      onChange={handleConfigChange}
                      disabled={form.formState.isSubmitting}
                    />
                  </div>
                )}

              <FormField
                control={form.control}
                name="selectedModelName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={form.formState.isSubmitting}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a model (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">
                          <span className="text-muted-foreground">
                            None (Unset)
                          </span>
                        </SelectItem>
                        {models.map(model => (
                          <SelectItem key={model.name} value={model.name}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.formState.errors.root && (
                <div className="text-sm text-red-500">
                  {form.formState.errors.root.message}
                </div>
              )}
            </div>

            <DialogFooter className="flex-row justify-between sm:justify-between">
              <div>
                {onBack && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      onOpenChange(false);
                      onBack();
                    }}
                    disabled={form.formState.isSubmitting}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={form.formState.isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface ConfigSchemaFormProps {
  schema: {
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
  };
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}

function ConfigSchemaForm({
  schema,
  values,
  onChange,
  disabled,
}: ConfigSchemaFormProps) {
  if (!schema.properties) return null;

  const required = schema.required || [];

  return (
    <div className="space-y-4">
      {Object.entries(schema.properties).map(([key, prop]) => (
        <ConfigField
          key={key}
          name={key}
          property={prop}
          value={values[key]}
          onChange={value => onChange(key, value)}
          required={required.includes(key)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

interface ConfigFieldProps {
  name: string;
  property: JsonSchemaProperty;
  value: unknown;
  onChange: (value: unknown) => void;
  required?: boolean;
  disabled?: boolean;
}

function ConfigField({
  name,
  property,
  value,
  onChange,
  required,
  disabled,
}: ConfigFieldProps) {
  const label = property.title || name;
  const description = property.description;

  if (property.enum && property.enum.length > 0) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <Select
          value={String(value ?? '')}
          onValueChange={onChange}
          disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {property.enum.map(option => (
              <SelectItem key={String(option)} value={String(option)}>
                {String(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {description && (
          <p className="text-muted-foreground text-xs">{description}</p>
        )}
      </div>
    );
  }

  if (property.type === 'boolean') {
    return (
      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id={name}
          checked={Boolean(value)}
          onChange={e => onChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4"
        />
        <label htmlFor={name} className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {description && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="text-muted-foreground h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">{description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  }

  if (property.type === 'number' || property.type === 'integer') {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <Input
          type="number"
          value={value !== undefined ? String(value) : ''}
          onChange={e => {
            const num =
              property.type === 'integer'
                ? parseInt(e.target.value, 10)
                : parseFloat(e.target.value);
            onChange(isNaN(num) ? undefined : num);
          }}
          min={property.minimum}
          max={property.maximum}
          disabled={disabled}
          placeholder={
            property.default !== undefined
              ? String(property.default)
              : undefined
          }
        />
        {description && (
          <p className="text-muted-foreground text-xs">{description}</p>
        )}
      </div>
    );
  }

  if (
    property.format === 'textarea' ||
    (property.maxLength && property.maxLength > 200)
  ) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <Textarea
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          placeholder={
            property.default !== undefined
              ? String(property.default)
              : undefined
          }
          className="min-h-[80px]"
        />
        {description && (
          <p className="text-muted-foreground text-xs">{description}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <Input
        type="text"
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={
          property.default !== undefined ? String(property.default) : undefined
        }
      />
      {description && (
        <p className="text-muted-foreground text-xs">{description}</p>
      )}
    </div>
  );
}
