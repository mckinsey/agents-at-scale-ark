import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import {
  ChevronDown,
  ChevronRight,
  CollapseContent,
  ExpandContent,
  RestartAlt,
  Tune,
  Warning,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { FormField } from '@/components/ui/form';
import { IconShell } from '@/components/ui/icon-shell';
import {
  GHOST_TRIGGER,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Agent } from '@/lib/services';
import { cn } from '@/lib/utils';

import {
  DEFAULT_SELECTOR_PROMPT,
  DEFAULT_TERMINATE_PROMPT,
  type TeamFormValues,
} from '../use-team-form';

interface SelectorSectionProps {
  form: UseFormReturn<TeamFormValues>;
  agents: Agent[];
  unavailableAgents: string[];
  disabled?: boolean;
}

const RequiredMarker = () => (
  <span aria-hidden="true" className="text-fg-secondary">
    *
  </span>
);

export function SelectorSection({
  form,
  agents,
  unavailableAgents,
  disabled,
}: Readonly<SelectorSectionProps>) {
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const selectedStrategy = form.watch('strategy');

  if (selectedStrategy !== 'selector') {
    return null;
  }

  return (
    <>
      <FormField
        control={form.control}
        name="selectorAgent"
        render={({ field }) => (
          <FieldSet className="gap-2">
            <FieldTitle>
              Selector Agent <RequiredMarker />
            </FieldTitle>
            <Select
              onValueChange={field.onChange}
              value={field.value}
              disabled={disabled}>
              <SelectTrigger
                className={cn(
                  GHOST_TRIGGER,
                  'w-full',
                  unavailableAgents.includes(field.value || '') &&
                    'border-b-stroke-status-error',
                )}>
                <SelectValue placeholder="Select an agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-fg-tertiary">None (Unset)</span>
                </SelectItem>
                {field.value && unavailableAgents.includes(field.value) && (
                  <SelectItem key={field.value} value={field.value}>
                    {field.value} (Unavailable)
                  </SelectItem>
                )}
                {agents.map(agent => (
                  <SelectItem key={agent.name} value={agent.name}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Selector strategy uses an AI agent to choose the next team member.
            </FieldDescription>
          </FieldSet>
        )}
      />

      <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
        <CollapsibleTrigger className="text-fg-secondary flex w-full items-center justify-start gap-2 px-0 hover:bg-transparent">
          <IconShell size="sm" variant="secondary">
            {isAdvancedOpen ? <ChevronDown /> : <ChevronRight />}
          </IconShell>
          <IconShell size="sm" variant="secondary">
            <Tune />
          </IconShell>
          <span className="text-fg-secondary text-xs font-semibold tracking-wide uppercase">
            Advanced Settings
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4" style={{ marginLeft: 0 }}>
          <FormField
            control={form.control}
            name="selectorPrompt"
            render={({ field }) => (
              <FieldSet className="gap-2">
                <div className="flex items-center justify-between">
                  <FieldTitle>Selector Prompt</FieldTitle>
                  <div className="flex items-center gap-2">
                    {field.value && field.value.length > 0 && (
                      <span className="text-fg-tertiary text-xs">
                        {field.value.length} characters
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsPromptExpanded(!isPromptExpanded)}>
                      <IconShell size="sm" variant="secondary">
                        {isPromptExpanded ? <CollapseContent /> : <ExpandContent />}
                      </IconShell>
                      {isPromptExpanded ? 'Collapse' : 'Expand'}
                    </Button>
                  </div>
                </div>
                <Textarea
                  placeholder="Enter the selector prompt..."
                  disabled={disabled}
                  className={`scrollbar-thin resize-none transition-all duration-200 ${
                    isPromptExpanded
                      ? 'max-h-[500px] min-h-[400px] overflow-y-auto'
                      : 'max-h-48 min-h-48 overflow-y-auto'
                  }`}
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                  }}
                  {...field}
                />
                {isPromptExpanded && field.value && field.value.length > 0 && (
                  <div className="text-fg-tertiary text-xs">
                    {field.value.split('\n').length} lines
                  </div>
                )}
                <div className="mt-2 flex items-start gap-1">
                  <IconShell
                    size="sm"
                    className="text-status-warning shrink-0 opacity-100">
                    <Warning />
                  </IconShell>
                  <span className="text-fg-secondary text-sm leading-5">
                    Changing the prompt will affect team turn order and can
                    worsen performance. Use the reset button to restore the
                    default prompt.
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => form.setValue('selectorPrompt', DEFAULT_SELECTOR_PROMPT, { shouldDirty: true })}
                  disabled={disabled}
                  className="mt-2">
                  <IconShell size="sm" variant="secondary">
                    <RestartAlt />
                  </IconShell>
                  Reset to Default Prompt
                </Button>
              </FieldSet>
            )}
          />
          <FormField
            control={form.control}
            name="enableTerminateTool"
            render={({ field }) => (
              <div className="flex flex-row items-start gap-3">
                <Checkbox
                  checked={field.value ?? true}
                  onCheckedChange={field.onChange}
                  disabled={disabled}
                />
                <div className="space-y-1 leading-none">
                  <FieldTitle>Enable Terminate Tool</FieldTitle>
                  <p className="text-fg-tertiary text-xs">
                    Allow the selector agent to use the terminate tool to end
                    the conversation early when appropriate.
                  </p>
                </div>
              </div>
            )}
          />
          {form.watch('enableTerminateTool') && (
            <FormField
              control={form.control}
              name="terminatePrompt"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <FieldTitle>Terminate Prompt</FieldTitle>
                  <Textarea
                    placeholder="Enter the terminate prompt..."
                    disabled={disabled}
                    className="scrollbar-thin min-h-[60px] resize-none"
                    {...field}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      form.setValue('terminatePrompt', DEFAULT_TERMINATE_PROMPT, {
                        shouldDirty: true,
                      })
                    }
                    disabled={disabled}
                    className="mt-2">
                    <IconShell size="sm" variant="secondary">
                      <RestartAlt />
                    </IconShell>
                    Reset to Default Prompt
                  </Button>
                </FieldSet>
              )}
            />
          )}
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
