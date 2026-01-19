'use client';

import type { UseFormReturn } from 'react-hook-form';

import {
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
import type { Model } from '@/lib/services';

import type { AgentFormValues } from '../types';

interface ModelConfigSectionProps {
  form: UseFormReturn<AgentFormValues>;
  models: Model[];
  showExecutionEngine?: boolean;
}

export function ModelConfigSection({
  form,
  models,
  showExecutionEngine = false,
}: ModelConfigSectionProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Model Configuration
      </h3>

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
              <FormControl>
                <Input
                  placeholder="e.g., langchain-executor"
                  disabled={form.formState.isSubmitting}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}

