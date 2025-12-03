'use client';

import { zodResolver } from '@hookform/resolvers/zod';
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
import type { components } from '@/lib/api/generated/types';
import {
  type Agent,
  type Evaluation,
  type Evaluator,
  type Model,
  type Team,
  agentsService,
  evaluationsService,
  evaluatorsService,
  modelsService,
  queriesService,
  teamsService,
} from '@/lib/services';

type EvaluationCreateRequest = components['schemas']['EvaluationCreateRequest'];
type EvaluationUpdateRequest = components['schemas']['EvaluationUpdateRequest'];
type QueryResponse = components['schemas']['QueryResponse'];

interface EvaluationEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluation: Evaluation | null;
  onSave: (
    evaluation: (EvaluationCreateRequest | EvaluationUpdateRequest) & {
      id?: string;
    },
  ) => void;
  initialEvaluator?: string;
  initialQueryRef?: string;
}

const VALID_FORM_MODES = ['direct', 'query', 'batch'] as const;
type FormMode = (typeof VALID_FORM_MODES)[number];

const isValidFormMode = (mode: unknown): mode is FormMode =>
  VALID_FORM_MODES.includes(mode as FormMode);

const formSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Name is required')
      .regex(
        /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
        'Name must be a valid Kubernetes name (lowercase letters, numbers, and hyphens only)',
      ),
    mode: z.enum(VALID_FORM_MODES),
    evaluatorRef: z.string().min(1, 'Evaluator is required'),
    queryRef: z.string().optional(),
    input: z.string().optional(),
    output: z.string().optional(),
    targetType: z.enum(['agent', 'team', 'model'] as const).optional(),
    targetRef: z.string().optional(),
  })
  .refine(
    data => {
      if (data.mode === 'direct') {
        return data.input && data.input.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Input is required for direct mode',
      path: ['input'],
    },
  )
  .refine(
    data => {
      if (data.mode === 'direct') {
        return data.output && data.output.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Output is required for direct mode',
      path: ['output'],
    },
  )
  .refine(
    data => {
      if (data.mode === 'query' || data.mode === 'batch') {
        return data.queryRef && data.queryRef.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Query reference is required for query and batch modes',
      path: ['queryRef'],
    },
  )
  .refine(
    data => {
      if (data.mode === 'query' || data.mode === 'batch') {
        return data.targetRef && data.targetRef.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Target selection is required for query and batch modes',
      path: ['targetRef'],
    },
  );

export function EvaluationEditor({
  open,
  onOpenChange,
  evaluation,
  onSave,
  initialEvaluator,
  initialQueryRef,
}: EvaluationEditorProps) {
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [queries, setQueries] = useState<QueryResponse[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [evaluatorsLoading, setEvaluatorsLoading] = useState(false);
  const [queriesLoading, setQueriesLoading] = useState(false);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const isEditing = !!evaluation;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      mode: 'direct',
      evaluatorRef: '',
      queryRef: '',
      input: '',
      output: '',
      targetType: 'agent',
      targetRef: '',
    },
  });

  const selectedMode = form.watch('mode');
  const selectedTargetType = form.watch('targetType');

  const safe = <T,>(
    requestName: string,
    p: Promise<T>,
    fallback: T,
  ): Promise<T> => {
    return p.catch(err => {
      console.error(`${requestName} failed:`, err);
      return fallback;
    });
  };

  useEffect(() => {
    if (open) {
      const loadData = async () => {
        setEvaluatorsLoading(true);
        setQueriesLoading(true);
        setTargetsLoading(true);

        try {
          const [
            evaluatorsData,
            queriesData,
            agentsData,
            teamsData,
            modelsData,
          ] = await Promise.all([
            safe('evaluatorsGetAll', evaluatorsService.getAll(), []),
            safe('queriesGetAll', queriesService.list(), {
              items: [],
              count: 0,
            }),
            safe('agentsGetAll', agentsService.getAll(), []),
            safe('teamsGetAll', teamsService.getAll(), []),
            safe('modelsGetAll', modelsService.getAll(), []),
          ]);
          setEvaluators(evaluatorsData);
          setQueries(queriesData.items);
          setAgents(agentsData);
          setTeams(teamsData);
          setModels(modelsData);
        } catch (error) {
          toast.error('Failed to Load Data', {
            description:
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred',
          });
        } finally {
          setEvaluatorsLoading(false);
          setQueriesLoading(false);
          setTargetsLoading(false);
        }
      };
      loadData();
    }
  }, [open]);

  useEffect(() => {
    const loadEvaluationDetails = async () => {
      if (evaluation && isEditing) {
        try {
          const detailedEvaluation = await evaluationsService.getDetailsByName(
            evaluation.name,
          );
          if (detailedEvaluation) {
            const evaluatorSpec = detailedEvaluation.spec?.evaluator as {
              name?: string;
            };
            const queryRefSpec = detailedEvaluation.spec?.queryRef as {
              name?: string;
            };

            const apiMode = detailedEvaluation.spec?.mode;
            form.reset({
              name: detailedEvaluation.name,
              mode: isValidFormMode(apiMode) ? apiMode : 'direct',
              evaluatorRef: evaluatorSpec?.name || '',
              queryRef: queryRefSpec?.name || '',
              input: (detailedEvaluation.spec?.input as string) || '',
              output: (detailedEvaluation.spec?.output as string) || '',
              targetType: 'agent',
              targetRef: '',
            });
          }
        } catch (error) {
          toast.error('Failed to Load Evaluation Details', {
            description:
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred',
          });
          form.reset({
            name: evaluation.name,
            mode: isValidFormMode(evaluation.type) ? evaluation.type : 'direct',
            evaluatorRef: '',
            queryRef: '',
            input: '',
            output: '',
            targetType: 'agent',
            targetRef: '',
          });
        }
      } else if (!evaluation) {
        form.reset({
          name: '',
          mode: initialQueryRef ? 'query' : 'direct',
          evaluatorRef: initialEvaluator || '',
          queryRef: initialQueryRef || '',
          input: '',
          output: '',
          targetType: 'agent',
          targetRef: '',
        });
      }
    };

    if (open) {
      loadEvaluationDetails();
    }
  }, [evaluation, isEditing, open, initialEvaluator, initialQueryRef, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const evaluationData = {
      name: values.name,
      type: values.mode,
      config: {
        ...(values.input && { input: values.input }),
        ...(values.output && { output: values.output }),
        ...(values.queryRef && {
          queryRef: {
            name: values.queryRef,
            ...(values.targetRef && {
              responseTarget: `${values.targetType}:${values.targetRef}`,
            }),
          },
        }),
      },
      evaluator: {
        name: values.evaluatorRef,
      },
      ...(isEditing && { id: evaluation.name }),
    };

    onSave(evaluationData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Evaluation' : 'Create New Evaluation'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the evaluation configuration.'
              : 'Create a new evaluation to assess performance.'}
          </DialogDescription>
        </DialogHeader>

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
                        placeholder="evaluation-name"
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
                name="mode"
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
                          <SelectValue placeholder="Select evaluation mode" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="direct">Direct</SelectItem>
                        <SelectItem value="query">Query</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="evaluatorRef"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Evaluator <span className="text-red-500">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={form.formState.isSubmitting}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an evaluator" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {evaluatorsLoading ? (
                          <SelectItem value="__loading__" disabled>
                            Loading evaluators...
                          </SelectItem>
                        ) : (
                          evaluators.map(evaluator => (
                            <SelectItem
                              key={evaluator.name}
                              value={evaluator.name}>
                              {evaluator.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(selectedMode === 'query' || selectedMode === 'batch') && (
                <>
                  <FormField
                    control={form.control}
                    name="queryRef"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Query Reference{' '}
                          <span className="text-red-500">*</span>
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || '__none__'}
                          disabled={form.formState.isSubmitting}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a query" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-muted-foreground">
                                None
                              </span>
                            </SelectItem>
                            {queriesLoading ? (
                              <SelectItem value="__loading__" disabled>
                                Loading queries...
                              </SelectItem>
                            ) : (
                              queries.map(query => (
                                <SelectItem key={query.name} value={query.name}>
                                  {query.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="targetType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Type</FormLabel>
                        <Select
                          onValueChange={value => {
                            field.onChange(value);
                            form.setValue('targetRef', '');
                          }}
                          value={field.value}
                          disabled={form.formState.isSubmitting}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select target type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="agent">Agent</SelectItem>
                            <SelectItem value="team">Team</SelectItem>
                            <SelectItem value="model">Model</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="targetRef"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Target <span className="text-red-500">*</span>
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || '__none__'}
                          disabled={form.formState.isSubmitting}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue
                                placeholder={`Select a ${selectedTargetType}`}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-muted-foreground">
                                None
                              </span>
                            </SelectItem>
                            {targetsLoading ? (
                              <SelectItem value="__loading__" disabled>
                                Loading {selectedTargetType}s...
                              </SelectItem>
                            ) : (
                              <>
                                {selectedTargetType === 'agent' &&
                                  agents.map(agent => (
                                    <SelectItem
                                      key={agent.name}
                                      value={agent.name}>
                                      {agent.name}
                                    </SelectItem>
                                  ))}
                                {selectedTargetType === 'team' &&
                                  teams.map(team => (
                                    <SelectItem
                                      key={team.name}
                                      value={team.name}>
                                      {team.name}
                                    </SelectItem>
                                  ))}
                                {selectedTargetType === 'model' &&
                                  models.map(model => (
                                    <SelectItem
                                      key={model.name}
                                      value={model.name}>
                                      {model.name}
                                    </SelectItem>
                                  ))}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {selectedMode === 'direct' && (
                <>
                  <FormField
                    control={form.control}
                    name="input"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Input <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Input data for evaluation..."
                            disabled={form.formState.isSubmitting}
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="output"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Output <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Expected output or actual output to evaluate..."
                            disabled={form.formState.isSubmitting}
                            rows={3}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
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
                {form.formState.isSubmitting
                  ? 'Saving...'
                  : isEditing
                    ? 'Update Evaluation'
                    : 'Create Evaluation'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
