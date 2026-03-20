import { Settings } from 'lucide-react';
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
import type { Agent, TeamMember } from '@/lib/services';

import { DEFAULT_SELECTOR_PROMPT, type TeamFormValues } from '../use-team-form';
import { WarningsSection } from './warnings-section';

interface StrategySectionProps {
  form: UseFormReturn<TeamFormValues>;
  agents: Agent[];
  selectedMembers: TeamMember[];
  disabled?: boolean;
}

export function StrategySection({
  form,
  agents,
  selectedMembers,
  disabled,
}: Readonly<StrategySectionProps>) {
  const selectedStrategy = form.watch('strategy');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="text-muted-foreground h-4 w-4" />
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Strategy Configuration
        </h3>
      </div>

      <FormField
        control={form.control}
        name="strategy"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Strategy <span className="text-red-500">*</span>
            </FormLabel>
            <Select
              onValueChange={value => {
                field.onChange(value);
                if (value === 'selector' && !form.getValues('selectorPrompt')) {
                  form.setValue('selectorPrompt', DEFAULT_SELECTOR_PROMPT);
                }
              }}
              value={field.value}
              disabled={disabled}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a strategy" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="round-robin">Round Robin</SelectItem>
                <SelectItem value="selector">Selector</SelectItem>
                <SelectItem value="graph">Graph</SelectItem>
                <SelectItem value="sequential">Sequential</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {selectedStrategy !== 'sequential' && (
        <FormField
          control={form.control}
          name="maxTurns"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Max Turns{' '}
                {selectedStrategy === 'graph' && (
                  <span className="text-red-500">*</span>
                )}
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="e.g., 10"
                  disabled={disabled}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <WarningsSection
        agents={agents}
        selectedMembers={selectedMembers}
        strategy={selectedStrategy}
        selectorAgent={form.watch('selectorAgent')}
      />
    </div>
  );
}
