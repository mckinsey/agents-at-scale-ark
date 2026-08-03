import { type UseFormReturn, useWatch } from 'react-hook-form';

import { Checkbox } from '@/components/ui/checkbox';
import {
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  GHOST_TRIGGER,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Agent, TeamMember } from '@/lib/services';
import { cn } from '@/lib/utils';

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

const RequiredMarker = () => (
  <span aria-hidden="true" className="text-fg-secondary">
    *
  </span>
);

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
    <>
      <FormField
        control={form.control}
        name="strategy"
        render={({ field }) => (
          <FieldSet className="gap-2">
            <FieldTitle>
              Strategy <RequiredMarker />
            </FieldTitle>
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
              <SelectTrigger className={cn(GHOST_TRIGGER, 'w-full')}>
                <SelectValue placeholder="Select a strategy">
                  {(value: string) => {
                    const item = strategyItems.find(i => i.value === value);
                    return item?.label ?? value;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {strategyItems.map(item => (
                  <SelectItem key={item.value} value={item.value}>
                    <SelectItemText>{item.label}</SelectItemText>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldSet>
        )}
      />

      {selectedStrategy === 'sequential' && (
        <FormField
          control={form.control}
          name="loops"
          render={({ field }) => (
            <div className="flex flex-row items-center gap-2">
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
              <Label className="text-sm font-normal">
                Enable loops (cycle through members repeatedly)
              </Label>
            </div>
          )}
        />
      )}

      {(selectedStrategy !== 'sequential' || loopsChecked) && (
        <FormField
          control={form.control}
          name="maxTurns"
          render={({ field, fieldState }) => (
            <FieldSet className="gap-2">
              <FieldTitle>
                Max Turns <RequiredMarker />
              </FieldTitle>
              <Input
                variant="inline"
                type="number"
                placeholder="e.g., 10"
                disabled={disabled}
                aria-invalid={!!fieldState.error}
                {...field}
              />
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldSet>
          )}
        />
      )}

      <WarningsSection
        agents={agents}
        selectedMembers={selectedMembers}
        strategy={selectedStrategy}
        enableTerminateTool={enableTerminateTool}
      />
    </>
  );
}
