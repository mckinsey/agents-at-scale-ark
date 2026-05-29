import { type UseFormReturn, useWatch } from 'react-hook-form';

import { Settings } from '@/components/icons';
import { Checkbox } from '@/components/ui/checkbox';
import { IconShell } from '@/components/ui/icon-shell';
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
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Agent, TeamMember } from '@/lib/services';

import { DEFAULT_SELECTOR_PROMPT, type TeamFormValues } from '../use-team-form';
import { WarningsSection } from './warnings-section';

const strategyItems = [
  { label: 'Sequential', value: 'sequential' },
  { label: 'Selector', value: 'selector' },
];

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
  const selectedStrategy = useWatch({ control: form.control, name: 'strategy' });
  const loopsChecked = useWatch({ control: form.control, name: 'loops' });
  const enableTerminateTool = useWatch({
    control: form.control,
    name: 'enableTerminateTool',
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <IconShell size="sm" variant="secondary">
          <Settings />
        </IconShell>
        <h3 className="text-fg-secondary text-xs font-semibold tracking-wide uppercase">
          Strategy Configuration
        </h3>
      </div>

      <FormField
        control={form.control}
        name="strategy"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Strategy <span className="text-status-error">*</span>
            </FormLabel>
            <Select
              items={strategyItems}
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
                  <SelectValue placeholder="Select a strategy">
                    {(value: string) => {
                      const item = strategyItems.find(i => i.value === value);
                      return item?.label ?? value;
                    }}
                  </SelectValue>
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {strategyItems.map(item => (
                  <SelectItem key={item.value} value={item.value}>
                    <SelectItemText>{item.label}</SelectItemText>
                  </SelectItem>
                ))}
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
                <span className="text-status-error">*</span>
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
        enableTerminateTool={enableTerminateTool}
      />
    </div>
  );
}
