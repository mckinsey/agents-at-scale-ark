import type { UseFormReturn } from 'react-hook-form';

import { InsertDriveFile } from '@/components/icons';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { IconShell } from '@/components/ui/icon-shell';
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
        <IconShell size="sm" variant="secondary">
          <InsertDriveFile />
        </IconShell>
        <h3 className="text-fg-secondary text-xs font-semibold tracking-wide uppercase">
          Basic Information
        </h3>
      </div>

      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Name {!isViewing && <span className="text-status-error">*</span>}
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
