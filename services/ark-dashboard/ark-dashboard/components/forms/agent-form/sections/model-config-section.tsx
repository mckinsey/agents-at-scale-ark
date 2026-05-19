'use client';

import type { UseFormReturn } from 'react-hook-form';

import { Checkbox } from '@/components/ui/checkbox';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Model } from '@/lib/services';
import type { ExecutionEngine, ExecutionEnginePhase } from '@/lib/services';

import {
  type AgentFormValues,
  FILE_INPUTS_EXECUTOR,
  RESPONSES_EXECUTOR,
} from '../types';

const HIDDEN_EXECUTORS = new Set<string>([FILE_INPUTS_EXECUTOR]);

const PHASE_COLORS: Record<ExecutionEnginePhase, string> = {
  ready: 'bg-green-500',
  running: 'bg-yellow-500',
  error: 'bg-red-500',
};

interface ModelConfigSectionProps {
  form: UseFormReturn<AgentFormValues>;
  models: Model[];
  executionEngines?: ExecutionEngine[];
  showExecutionEngine?: boolean;
  showPairFileAssistant?: boolean;
  disabled?: boolean;
}

export function ModelConfigSection({
  form,
  models,
  executionEngines = [],
  showExecutionEngine = false,
  showPairFileAssistant = false,
  disabled = false,
}: ModelConfigSectionProps) {
  const executionEngineValue = form.watch('executionEngineName');
  const showPairToggle =
    showPairFileAssistant && executionEngineValue === RESPONSES_EXECUTOR;
  return (
    <div className="space-y-2">
      <FormField
        control={form.control}
        name="selectedModelName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Model</FormLabel>
            <Select
              onValueChange={field.onChange}
              value={field.value}
              disabled={disabled}>
              <FormControl>
                <SelectTrigger className="border-border">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-muted-foreground">None (Unset)</span>
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

      {showExecutionEngine && (
        <FormField
          control={form.control}
          name="executionEngineName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Execution Engine</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value || '__none__'}
                disabled={disabled}>
                <FormControl>
                  <SelectTrigger className="border-border">
                    <SelectValue placeholder="Select an execution engine" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">None (Unset)</span>
                  </SelectItem>
                  {executionEngines
                    .filter(
                      engine =>
                        !HIDDEN_EXECUTORS.has(engine.name) ||
                        engine.name === field.value,
                    )
                    .map(engine => (
                      <SelectItem key={engine.name} value={engine.name}>
                        <span className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${PHASE_COLORS[engine.phase]}`}
                          />
                          <span>{engine.name}</span>
                          <span className="text-muted-foreground text-xs">
                            {engine.phase}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {showPairToggle && (
        <FormField
          control={form.control}
          name="pairFileAssistant"
          render={({ field }) => (
            <FormItem className="flex items-start gap-3 rounded-md border border-dashed p-3">
              <FormControl>
                <Checkbox
                  checked={!!field.value}
                  onCheckedChange={field.onChange}
                  disabled={disabled}
                />
              </FormControl>
              <div className="space-y-1 text-sm leading-tight">
                <FormLabel className="cursor-pointer text-sm font-medium">
                  Pair a file assistant
                </FormLabel>
                <p className="text-muted-foreground text-xs">
                  Also creates &lt;name&gt;-files using
                  executor-openai-file-inputs and the same Model CR. The agent
                  view will surface its uploads inline; files attached during
                  chat flow through to this agent&apos;s Responses call.
                </p>
              </div>
            </FormItem>
          )}
        />
      )}
    </div>
  );
}
