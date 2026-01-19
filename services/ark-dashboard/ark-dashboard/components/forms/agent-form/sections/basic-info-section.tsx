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

import { AgentFormMode, type AgentFormValues } from '../types';

interface BasicInfoSectionProps {
  form: UseFormReturn<AgentFormValues>;
  mode: AgentFormMode;
}

export function BasicInfoSection({ form, mode }: BasicInfoSectionProps) {
  const isEditing = mode === AgentFormMode.EDIT;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Basic Information
      </h3>

      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Name {!isEditing && <span className="text-destructive">*</span>}
            </FormLabel>
            <FormControl>
              <Input
                placeholder={isEditing ? undefined : 'e.g., customer-support-agent'}
                disabled={isEditing || form.formState.isSubmitting}
                className={isEditing ? 'bg-muted/50 font-mono text-sm' : undefined}
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
                placeholder="Brief description of the agent's purpose"
                disabled={form.formState.isSubmitting}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

