import { AlertCircle, ChevronDown, ChevronRight, Maximize2, Minimize2, RotateCcw, Settings2, Zap } from 'lucide-react';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
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
        <Zap className="text-muted-foreground h-4 w-4" />
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Selector Configuration
        </h3>
      </div>

      <div className="bg-muted/50 rounded-md border p-3">
        <p className="text-muted-foreground mb-3 text-xs">
          Selector strategy uses an AI agent to choose the next team member.
        </p>
      </div>

      <FormField
        control={form.control}
        name="selectorAgent"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Selector Agent <span className="text-red-500">*</span>
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
                      'border-red-500',
                  )}>
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-muted-foreground">None (Unset)</span>
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
            <FormMessage />
          </FormItem>
        )}
      />

      <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-start gap-2 px-0 hover:bg-transparent">
          {isAdvancedOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
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
                      <span className="text-muted-foreground text-xs">
                        {field.value.length} characters
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                      className="h-8 px-2">
                      {isPromptExpanded ? (
                        <>
                          <Minimize2 className="mr-1 h-4 w-4" />
                          Collapse
                        </>
                      ) : (
                        <>
                          <Maximize2 className="mr-1 h-4 w-4" />
                          Expand
                        </>
                      )}
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
                  <div className="text-muted-foreground text-xs">
                    {field.value.split('\n').length} lines
                  </div>
                )}
                <FormMessage />
                <Alert variant="warning" className="mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Changing the prompt will affect team turn order and can worsen performance.
                    Use the reset button to restore the default prompt.
                  </AlertDescription>
                </Alert>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => form.setValue('selectorPrompt', DEFAULT_SELECTOR_PROMPT, { shouldDirty: true })}
                  disabled={disabled}
                  className="mt-2">
                  <RotateCcw className="mr-2 h-4 w-4" />
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
                  <p className="text-muted-foreground text-xs">
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
                    <RotateCcw className="mr-2 h-4 w-4" />
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
