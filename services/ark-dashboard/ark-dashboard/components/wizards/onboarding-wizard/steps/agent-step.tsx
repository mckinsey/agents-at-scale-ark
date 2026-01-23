'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { agentsService } from '@/lib/services/agents';
import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

import {
  DEFAULT_AGENT_NAME,
  DEFAULT_MODEL_NAME,
  SAMPLE_AGENT_DESCRIPTION,
  SAMPLE_AGENT_PROMPT,
} from '../constants';
import { useWizard } from '../wizard-context';

const agentSchema = z.object({
  name: kubernetesNameSchema,
  description: z.string().optional(),
  prompt: z.string().min(1, { message: 'Prompt is required' }),
});

type AgentFormValues = z.infer<typeof agentSchema>;

export function AgentStep() {
  const { state, setCurrentStep, setCreatedAgentName } = useWizard();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AgentFormValues>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      name: DEFAULT_AGENT_NAME,
      description: SAMPLE_AGENT_DESCRIPTION,
      prompt: SAMPLE_AGENT_PROMPT,
    },
  });

  const onSubmit = async (values: AgentFormValues) => {
    setIsSubmitting(true);
    try {
      const modelName = state.createdModelName || DEFAULT_MODEL_NAME;
      await agentsService.create({
        name: values.name,
        description: values.description || undefined,
        prompt: values.prompt,
        modelRef: {
          name: modelName,
        },
      });
      setCreatedAgentName(values.name);
      toast.success('Agent created successfully');
      setCurrentStep('finish');
    } catch (error) {
      toast.error('Failed to create agent', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (!state.skipModelStep) {
      setCurrentStep('model');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Create Your First Agent</h3>
        <p className="text-muted-foreground text-sm">
          Set up an AI assistant with a custom prompt. We&apos;ve pre-filled a
          sample research assistant prompt to get you started.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    {...field}
                    placeholder="e.g., my-assistant"
                    disabled={isSubmitting}
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
                    {...field}
                    placeholder="A brief description of what this agent does"
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormItem>
            <FormLabel>Model</FormLabel>
            <FormControl>
              <Input
                value={state.createdModelName || DEFAULT_MODEL_NAME}
                disabled
                className="bg-muted"
              />
            </FormControl>
          </FormItem>

          <FormField
            control={form.control}
            name="prompt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Prompt <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Enter the agent's instructions..."
                    disabled={isSubmitting}
                    className="min-h-[200px] resize-none"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-between pt-4">
            {!state.skipModelStep && (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={isSubmitting}>
                Back
              </Button>
            )}
            <div className={state.skipModelStep ? 'ml-auto' : ''}>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Creating Agent...
                  </>
                ) : (
                  'Create Agent'
                )}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
