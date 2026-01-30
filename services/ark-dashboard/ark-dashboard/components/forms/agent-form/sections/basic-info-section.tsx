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
  disabled?: boolean;
}

export function BasicInfoSection({
  form,
  mode,
  disabled = false,
}: BasicInfoSectionProps) {
  const isEditing = mode === AgentFormMode.EDIT;
  const isViewing = mode === AgentFormMode.VIEW;

  return (
    <div className="space-y-2">
      {!isViewing && (
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
                  placeholder={
                    isEditing ? undefined : 'e.g., customer-support-agent'
                  }
                  disabled={disabled || isEditing}
                  className={
                    isEditing ? 'bg-muted/50 font-mono text-sm' : undefined
                  }
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Input
                placeholder="Brief description of the agent's purpose"
                disabled={disabled}
                className="border-border"
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
