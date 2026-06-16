import { Settings } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';

import { Checkbox } from '@/components/ui/checkbox';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const loopsChecked = form.watch('loops');

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
                if (value !== 'sequential') {
                  form.setValue('loops', false);
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
                <SelectItem value="sequential">Sequential</SelectItem>
                <SelectItem value="selector">Selector</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {selectedStrategy === 'sequential' && (
        <FormField
          control={form.control}
          name="loops"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center space-y-0 gap-2">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={checked => {
                    field.onChange(checked);
                    if (!checked) {
                      form.setValue('maxTurns', '');
                    }
                  }}
                  disabled={disabled}
                />
              </FormControl>
              <Label className="text-sm font-normal">
                Enable loops (cycle through members repeatedly)
              </Label>
            </FormItem>
          )}
        />
      )}

      {(selectedStrategy !== 'sequential' || loopsChecked) && (
        <FormField
          control={form.control}
          name="maxTurns"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Max Turns{' '}
                <span className="text-red-500">*</span>
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
        enableTerminateTool={form.watch('enableTerminateTool')}
      />
    </div>
  );
}
