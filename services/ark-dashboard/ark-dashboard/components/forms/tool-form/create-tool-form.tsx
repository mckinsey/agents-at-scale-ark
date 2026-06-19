'use client';

import { useState } from 'react';

import {
  ChevronLeft,
  CollapseContent,
  ExpandContent,
} from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Form, FormField } from '@/components/ui/form';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

import { TOOL_TYPE_OPTIONS, type ToolFormProps } from './types';
import { useToolForm } from './use-tool-form';

const RequiredMarker = () => (
  <span aria-hidden="true" className="text-fg-secondary">
    *
  </span>
);

const inlineSelectTriggerClassName =
  'focus-visible:border-b-stroke-status-focus w-full rounded-none border-0 border-b border-white/[0.24] bg-transparent px-0 hover:border-b-white/40';

const jsonTextareaClassName = (expanded: boolean) =>
  cn(
    'resize-none font-mono transition-all duration-200',
    expanded
      ? 'max-h-[500px] min-h-[400px] overflow-y-auto'
      : 'max-h-[180px] min-h-[120px]',
  );

export function CreateToolForm({ onSuccess, onCancel }: ToolFormProps) {
  const { readOnlyMode } = useNamespace();
  const { form, state, actions } = useToolForm({ onSuccess });
  const { saving, agents, teams, agentsLoading, teamsLoading, selectedType } =
    state;
  const { onSubmit } = actions;

  const [isInputSchemaExpanded, setIsInputSchemaExpanded] = useState(false);
  const [isAnnotationsExpanded, setIsAnnotationsExpanded] = useState(false);

  const isDisabled = saving;
  const cancelHref = onCancel ? undefined : '/tools';

  return (
    <div className="absolute inset-0 flex flex-col gap-5 overflow-hidden px-12 pt-10">
      <header className="flex flex-none flex-col gap-4">
        <div className="flex items-center justify-between">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-sm leading-5 tracking-[-0.112px]">
            <ChevronLeft className="size-4 text-white/30" />
            <NamespacedLink
              href="/tools"
              className="text-white/30 transition-colors hover:text-white/60">
              Tools
            </NamespacedLink>
            <span aria-hidden="true" className="text-white/60">
              /
            </span>
            <span aria-current="page" className="text-white/60">
              Create tool
            </span>
          </nav>
          <div className="flex items-center gap-2">
            {cancelHref ? (
              <NamespacedLink href={cancelHref}>
                <Button variant="outline">Cancel</Button>
              </NamespacedLink>
            ) : (
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={saving || readOnlyMode}>
              {saving && <Spinner className="mr-2 h-4 w-4" />}
              Create
            </Button>
          </div>
        </div>
        <h1 className="text-fg-primary text-xl leading-7">
          New tool configuration
        </h1>
      </header>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 items-start overflow-hidden pb-2 pl-px">
          <div className="flex max-h-full min-h-0 w-[576px] flex-col gap-6 overflow-y-auto">
            <FormField
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <FieldTitle>
                    Name <RequiredMarker />
                  </FieldTitle>
                  <Input
                    variant="inline"
                    placeholder="e.g., search-tool"
                    disabled={isDisabled}
                    aria-invalid={!!fieldState.error}
                    {...field}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldSet>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <FieldTitle>
                    Type <RequiredMarker />
                  </FieldTitle>
                  <Select
                    items={TOOL_TYPE_OPTIONS}
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isDisabled}>
                    <SelectTrigger
                      className={inlineSelectTriggerClassName}
                      aria-invalid={!!fieldState.error}>
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent className="bg-fill-onsurface-ui-2">
                      {TOOL_TYPE_OPTIONS.map(item => (
                        <SelectItem key={item.value} value={item.value}>
                          <SelectItemText>{item.label}</SelectItemText>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldSet>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <FieldTitle>
                    Description <RequiredMarker />
                  </FieldTitle>
                  <Input
                    variant="inline"
                    placeholder="Tool description"
                    disabled={isDisabled}
                    aria-invalid={!!fieldState.error}
                    {...field}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldSet>
              )}
            />

            {selectedType === 'http' && (
              <FormField
                control={form.control}
                name="httpUrl"
                render={({ field, fieldState }) => (
                  <FieldSet className="gap-2">
                    <FieldTitle>
                      URL <RequiredMarker />
                    </FieldTitle>
                    <Input
                      variant="inline"
                      placeholder="https://example.com/api"
                      disabled={isDisabled}
                      aria-invalid={!!fieldState.error}
                      {...field}
                    />
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldSet>
                )}
              />
            )}

            {selectedType === 'agent' && (
              <FormField
                control={form.control}
                name="selectedAgent"
                render={({ field, fieldState }) => {
                  const agentItems = agents.map(a => ({
                    value: a.name,
                    label: a.name,
                  }));
                  return (
                    <FieldSet className="gap-2">
                      <FieldTitle>
                        Agent <RequiredMarker />
                      </FieldTitle>
                      <Select
                        items={agentItems}
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isDisabled || agentsLoading}>
                        <SelectTrigger
                          className={inlineSelectTriggerClassName}
                          aria-invalid={!!fieldState.error}>
                          <SelectValue
                            placeholder={
                              agentsLoading
                                ? 'Loading agents...'
                                : 'Select agent...'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="bg-fill-onsurface-ui-2">
                          {agentItems.map(item => (
                            <SelectItem key={item.value} value={item.value}>
                              <SelectItemText>{item.label}</SelectItemText>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </FieldSet>
                  );
                }}
              />
            )}

            {selectedType === 'team' && (
              <FormField
                control={form.control}
                name="selectedTeam"
                render={({ field, fieldState }) => {
                  const teamItems = teams.map(t => ({
                    value: t.name,
                    label: t.name,
                  }));
                  return (
                    <FieldSet className="gap-2">
                      <FieldTitle>
                        Team <RequiredMarker />
                      </FieldTitle>
                      <Select
                        items={teamItems}
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isDisabled || teamsLoading}>
                        <SelectTrigger
                          className={inlineSelectTriggerClassName}
                          aria-invalid={!!fieldState.error}>
                          <SelectValue
                            placeholder={
                              teamsLoading
                                ? 'Loading teams...'
                                : 'Select team...'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="bg-fill-onsurface-ui-2">
                          {teamItems.map(item => (
                            <SelectItem key={item.value} value={item.value}>
                              <SelectItemText>{item.label}</SelectItemText>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </FieldSet>
                  );
                }}
              />
            )}

            <FormField
              control={form.control}
              name="inputSchema"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <div className="flex items-center justify-between">
                    <FieldTitle>
                      Input Schema (JSON) <RequiredMarker />
                    </FieldTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setIsInputSchemaExpanded(!isInputSchemaExpanded)
                      }
                      className="h-8 gap-1 px-2">
                      <IconShell size="sm" variant="secondary">
                        {isInputSchemaExpanded ? (
                          <CollapseContent />
                        ) : (
                          <ExpandContent />
                        )}
                      </IconShell>
                      {isInputSchemaExpanded ? 'Collapse' : 'Expand'}
                    </Button>
                  </div>
                  <Textarea
                    placeholder='e.g., {"param": "value"}'
                    disabled={isDisabled}
                    aria-invalid={!!fieldState.error}
                    className={jsonTextareaClassName(isInputSchemaExpanded)}
                    {...field}
                  />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldSet>
              )}
            />

            <FormField
              control={form.control}
              name="annotations"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <div className="flex items-center justify-between">
                    <FieldTitle>Annotations (JSON)</FieldTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setIsAnnotationsExpanded(!isAnnotationsExpanded)
                      }
                      className="h-8 gap-1 px-2">
                      <IconShell size="sm" variant="secondary">
                        {isAnnotationsExpanded ? (
                          <CollapseContent />
                        ) : (
                          <ExpandContent />
                        )}
                      </IconShell>
                      {isAnnotationsExpanded ? 'Collapse' : 'Expand'}
                    </Button>
                  </div>
                  <Textarea
                    placeholder='e.g., {"note": "important"}'
                    disabled={isDisabled}
                    aria-invalid={!!fieldState.error}
                    className={jsonTextareaClassName(isAnnotationsExpanded)}
                    {...field}
                  />
                  <FieldDescription>
                    Optional metadata describing the tool.
                  </FieldDescription>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldSet>
              )}
            />
          </div>
        </form>
      </Form>
    </div>
  );
}
