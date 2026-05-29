import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import {
  Bolt,
  ChevronDown,
  ChevronRight,
  CollapseContent,
  ExpandContent,
  RestartAlt,
  Tune,
  Warning,
} from '@/components/icons';
import { Alert, AlertIcon, AlertContent, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { IconShell } from '@/components/ui/icon-shell';
import {
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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <IconShell size="sm" variant="secondary">
          <Bolt />
        </IconShell>
        <h3 className="text-fg-secondary text-xs font-semibold tracking-wide uppercase">
          Selector Configuration
        </h3>
      </div>

      <FormField
        control={form.control}
        name="selectorAgent"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Selector Agent <span className="text-status-error">*</span>
            </FormLabel>
            <Select
              onValueChange={field.onChange}
              value={field.value}
              disabled={disabled}>
              <FormControl>
                <SelectTrigger
                  className={cn(
                    '',
                    unavailableAgents.includes(field.value || '') &&
                      'border-stroke-status-error',
                  )}>
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
              </FormControl>
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
            <FormDescription>
              Selector strategy uses an AI agent to choose the next team member.
            </FormDescription>
            <FormMessage />
          </FormItem>
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
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Selector Prompt</FormLabel>
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
                <FormControl>
                  <Textarea
                    placeholder="Enter the selector prompt..."
                    disabled={disabled}
                    className={`resize-none transition-all duration-200 ${
                      isPromptExpanded
                        ? 'max-h-[500px] min-h-[400px] overflow-y-auto'
                        : 'max-h-[150px] min-h-[100px]'
                    }`}
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word',
                    }}
                    {...field}
                  />
                </FormControl>
                {isPromptExpanded && field.value && field.value.length > 0 && (
                  <div className="text-fg-tertiary text-xs">
                    {field.value.split('\n').length} lines
                  </div>
                )}
                <FormMessage />
                <Alert layout="long" className="mt-2">
                  <AlertIcon className="text-status-warning">
                    <Warning className="text-[25px]" />
                  </AlertIcon>
                  <AlertContent>
                    <AlertDescription>
                      Changing the prompt will affect team turn order and can worsen performance.
                      Use the reset button to restore the default prompt.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
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
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="enableTerminateTool"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                    disabled={disabled}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>Enable Terminate Tool</FormLabel>
                  <p className="text-fg-tertiary text-xs">
                    Allow the selector agent to use the terminate tool to end
                    the conversation early when appropriate.
                  </p>
                </div>
              </FormItem>
            )}
          />
          {form.watch('enableTerminateTool') && (
            <FormField
              control={form.control}
              name="terminatePrompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Terminate Prompt</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter the terminate prompt..."
                      disabled={disabled}
                      className="min-h-[60px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
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
                </FormItem>
              )}
            />
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
