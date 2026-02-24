import { FileText } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import { TeamFormMode } from '../types';
import type { TeamFormValues } from '../use-team-form';

interface BasicInfoSectionProps {
  form: UseFormReturn<TeamFormValues>;
  mode: TeamFormMode;
  disabled?: boolean;
}

export function BasicInfoSection({
  form,
  mode,
  disabled,
}: Readonly<BasicInfoSectionProps>) {
  const isViewing = mode === TeamFormMode.VIEW;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="text-muted-foreground h-4 w-4" />
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Basic Information
        </h3>
      </div>

      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Name {!isViewing && <span className="text-red-500">*</span>}
            </FormLabel>
            <FormControl>
              <Input
                placeholder="e.g., engineering-team"
                disabled={isViewing || disabled}
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
                placeholder="e.g., Core development and infrastructure team"
                disabled={disabled}
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
