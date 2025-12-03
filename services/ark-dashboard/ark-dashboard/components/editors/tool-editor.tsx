'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Label } from '@radix-ui/react-label';
import { Maximize2, Minimize2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { AgentFields } from '../common/agent-fields';
import { TeamFields } from '../common/team-fields';

interface ToolSpec {
  name: string;
  type: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, string>;
  url?: string;
  agent?: string;
  team?: string;
}

interface ToolEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (tool: ToolSpec) => void;
  namespace: string;
}

const formSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    type: z.string().min(1, 'Type is required'),
    description: z.string().min(1, 'Description is required'),
    inputSchema: z.string().min(1, 'Input Schema is required'),
    annotations: z.string().optional(),
    httpUrl: z.string().optional(),
    selectedAgent: z.string().optional(),
    selectedTeam: z.string().optional(),
  })
  .refine(
    data => {
      if (data.type === 'http') {
        return data.httpUrl && data.httpUrl.trim().length > 0;
      }
      return true;
    },
    {
      message: 'URL is required for HTTP type',
      path: ['httpUrl'],
    },
  )
  .refine(
    data => {
      if (data.type === 'agent') {
        return data.selectedAgent && data.selectedAgent.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Agent selection is required for Agent type',
      path: ['selectedAgent'],
    },
  )
  .refine(
    data => {
      if (data.type === 'team') {
        return data.selectedTeam && data.selectedTeam.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Team selection is required for Team type',
      path: ['selectedTeam'],
    },
  );

export function ToolEditor({
  open,
  onOpenChange,
  onSave,
  namespace,
}: Readonly<ToolEditorProps>) {
  const [isInputSchemaExpanded, setIsInputSchemaExpanded] = useState(false);
  const [isAnnotationsExpanded, setIsAnnotationsExpanded] = useState(false);

  const typeOptions = [
    { value: 'http', label: 'HTTP' },
    { value: 'mcp', label: 'MCP' },
    { value: 'agent', label: 'Agent' },
    { value: 'team', label: 'Team' },
  ];

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      type: '',
      description: '',
      inputSchema: '',
      annotations: '',
      httpUrl: '',
      selectedAgent: '',
      selectedTeam: '',
    },
  });

  const selectedType = form.watch('type');

  useEffect(() => {
    if (open) {
      form.reset();
      setIsInputSchemaExpanded(false);
      setIsAnnotationsExpanded(false);
    }
  }, [open, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    let parsedInputSchema: Record<string, unknown> | undefined;
    let parsedAnnotations: Record<string, string> | undefined;

    try {
      if (values.inputSchema.trim())
        parsedInputSchema = JSON.parse(values.inputSchema);
    } catch {
      toast.error('Invalid Input Schema', {
        description: 'Input Schema must be valid JSON.',
      });
      return;
    }

    try {
      if (values.annotations?.trim())
        parsedAnnotations = JSON.parse(values.annotations);
    } catch {
      toast.error('Invalid Annotations', {
        description: 'Annotations must be valid JSON.',
      });
      return;
    }

    const toolSpec: ToolSpec = {
      name: values.name.trim(),
      type: values.type.trim(),
      description: values.description.trim(),
      inputSchema: parsedInputSchema,
      annotations: parsedAnnotations,
      ...(values.type === 'http' ? { url: values.httpUrl?.trim() } : {}),
      ...(values.type === 'agent'
        ? { agent: values.selectedAgent?.trim() }
        : {}),
      ...(values.type === 'team' ? { team: values.selectedTeam?.trim() } : {}),
    };

    onSave(toolSpec);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Tool</DialogTitle>
          <DialogDescription>
            Fill in the information for the new tool.
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
                        placeholder="e.g., search-tool"
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
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Type <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={form.formState.isSubmitting}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {typeOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Description <span className="text-red-500">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Tool description"
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
                name="inputSchema"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>
                        Input Schema (JSON){' '}
                        <span className="text-red-500">*</span>
                      </FormLabel>
                      <div className="flex items-center gap-2">
                        {field.value.length > 0 && (
                          <span className="text-muted-foreground text-xs">
                            {field.value.length} characters
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setIsInputSchemaExpanded(!isInputSchemaExpanded)
                          }
                          className="h-8 px-2">
                          {isInputSchemaExpanded ? (
                            <>
                              <Minimize2 className="mr-1 h-4 w-4" />
                              Collapse
                            </>
                          ) : (
                            <>
                              <Maximize2 className="mr-1 h-4 w-4" />
                              Expand
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder='e.g., {"param": "value"}'
                        disabled={form.formState.isSubmitting}
                        className={`resize-none transition-all duration-200 ${
                          isInputSchemaExpanded
                            ? 'max-h-[500px] min-h-[400px] overflow-y-auto'
                            : 'max-h-[150px] min-h-[100px]'
                        }`}
                        style={{
                          whiteSpace: 'pre-wrap',
                          wordWrap: 'break-word',
                        }}
                        {...field}
                      />
                    </FormControl>
                    {isInputSchemaExpanded && field.value.length > 0 && (
                      <div className="text-muted-foreground text-xs">
                        {field.value.split('\n').length} lines
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="annotations"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Annotations (JSON)</FormLabel>
                      <div className="flex items-center gap-2">
                        {field.value && field.value.length > 0 && (
                          <span className="text-muted-foreground text-xs">
                            {field.value.length} characters
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setIsAnnotationsExpanded(!isAnnotationsExpanded)
                          }
                          className="h-8 px-2">
                          {isAnnotationsExpanded ? (
                            <>
                              <Minimize2 className="mr-1 h-4 w-4" />
                              Collapse
                            </>
                          ) : (
                            <>
                              <Maximize2 className="mr-1 h-4 w-4" />
                              Expand
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder='e.g., {"note": "important"}'
                        disabled={form.formState.isSubmitting}
                        className={`resize-none transition-all duration-200 ${
                          isAnnotationsExpanded
                            ? 'max-h-[500px] min-h-[400px] overflow-y-auto'
                            : 'max-h-[150px] min-h-[100px]'
                        }`}
                        style={{
                          whiteSpace: 'pre-wrap',
                          wordWrap: 'break-word',
                        }}
                        {...field}
                      />
                    </FormControl>
                    {isAnnotationsExpanded &&
                      field.value &&
                      field.value.length > 0 && (
                        <div className="text-muted-foreground text-xs">
                          {field.value.split('\n').length} lines
                        </div>
                      )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedType === 'http' && (
                <FormField
                  control={form.control}
                  name="httpUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        URL <span className="text-red-500">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com/api"
                          disabled={form.formState.isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedType === 'agent' && (
                <FormField
                  control={form.control}
                  name="selectedAgent"
                  render={({ field }) => (
                    <FormItem>
                      <Label>
                        Agent <span className="text-red-500">*</span>
                      </Label>
                      <AgentFields
                        selectedAgent={field.value || ''}
                        setSelectedAgent={field.onChange}
                        namespace={namespace}
                        open={open}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {selectedType === 'team' && (
                <FormField
                  control={form.control}
                  name="selectedTeam"
                  render={({ field }) => (
                    <FormItem>
                      <Label>
                        Team <span className="text-red-500">*</span>
                      </Label>
                      <TeamFields
                        selectedTeam={field.value || ''}
                        setSelectedTeam={field.onChange}
                        namespace={namespace}
                        open={open}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <DialogFooter>
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
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
