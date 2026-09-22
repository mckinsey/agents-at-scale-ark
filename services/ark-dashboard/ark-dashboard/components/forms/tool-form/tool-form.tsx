'use client';

import { useState } from 'react';

import { DetailBreadcrumb } from '@/components/common/detail-breadcrumb';
import { CollapseContent, ExpandContent } from '@/components/icons';
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
import {
  TOOL_PENDING_MESSAGES,
  summarizeToolStatus,
} from '@/lib/services/tools';
import { cn } from '@/lib/utils';
import { useNamespace } from '@/providers/NamespaceProvider';

import {
  INLINE_LANGUAGE_OPTIONS,
  MAX_INLINE_SOURCE_BYTES,
  TOOL_TYPE_OPTIONS,
  ToolFormMode,
  type ToolFormProps,
  inlineSourceByteLength,
} from './types';
import { useToolForm } from './use-tool-form';

const RequiredMarker = () => (
  <span aria-hidden="true" className="text-fg-secondary">
    *
  </span>
);

const inlineSelectTriggerClassName =
  'focus-visible:border-b-stroke-status-focus w-full rounded-none border-0 border-b border-white/[0.24] bg-transparent px-0 hover:border-b-white/40';

const inlineTextareaClassName =
  'min-h-9 resize-none border-0 border-b-[1px] border-b-stroke-tertiary bg-transparent px-0 py-1 shadow-none hover:border-b-stroke-tertiary-hover hover:bg-transparent focus-visible:border-b-stroke-status-focus focus-visible:bg-transparent focus-visible:shadow-elevation-0 focus-visible:ring-0 aria-invalid:border-b-status-error aria-invalid:ring-0 disabled:cursor-not-allowed disabled:bg-transparent disabled:text-fg-disabled disabled:placeholder:text-fg-disabled';

const jsonTextareaClassName = (expanded: boolean) =>
  cn(
    'resize-none font-mono transition-all duration-200',
    expanded
      ? 'max-h-[500px] min-h-[400px] overflow-y-auto'
      : 'max-h-[180px] min-h-[120px]',
  );

export function ToolForm({
  mode,
  toolName,
  onSuccess,
  onCancel,
}: Readonly<ToolFormProps>) {
  const { readOnlyMode } = useNamespace();
  const { form, state, actions } = useToolForm({ mode, toolName, onSuccess });
  const {
    loading,
    saving,
    tool,
    agents,
    teams,
    agentsLoading,
    teamsLoading,
    selectedType,
  } = state;
  const { onSubmit } = actions;

  const [isInputSchemaExpanded, setIsInputSchemaExpanded] = useState(false);
  const [isAnnotationsExpanded, setIsAnnotationsExpanded] = useState(false);
  const [isSourceExpanded, setIsSourceExpanded] = useState(false);

  const isViewing = mode === ToolFormMode.VIEW;
  const isEditing = mode === ToolFormMode.EDIT;
  const needsExistingTool = isViewing || isEditing;
  const isDisabled = saving || isViewing;
  const cancelHref = onCancel ? undefined : '/tools';

  // An inline tool is stored long before it can run. Say so rather than letting
  // an author assume a saved tool is a working tool.
  const toolStatus = summarizeToolStatus(tool?.status);
  const pendingMessage =
    tool?.spec?.type === 'inline' && toolStatus.available !== true
      ? (TOOL_PENDING_MESSAGES[toolStatus.reason ?? ''] ??
        toolStatus.message ??
        'Not executable yet.')
      : undefined;

  if (needsExistingTool && loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (needsExistingTool && !tool) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-fg-secondary">Tool not found</div>
      </div>
    );
  }

  const displayName = tool?.name || toolName || '';

  const header = isViewing ? (
    <header className="flex flex-none flex-col gap-4">
      <div className="flex items-center justify-between">
        <DetailBreadcrumb
          backHref="/tools"
          backLabel="Tools"
          current={displayName}
        />
        <div className="flex items-center gap-2">
          <NamespacedLink
            href={`/tools/${encodeURIComponent(displayName)}/edit`}>
            <Button variant="outline" disabled={readOnlyMode}>
              Edit
            </Button>
          </NamespacedLink>
          <NamespacedLink href="/tools">
            <Button variant="outline">Back</Button>
          </NamespacedLink>
        </div>
      </div>
      <h1 className="text-fg-primary text-xl leading-7">{displayName}</h1>
    </header>
  ) : (
    <header className="flex flex-none flex-col gap-4">
      <div className="flex items-center justify-between">
        <DetailBreadcrumb
          backHref="/tools"
          backLabel="Tools"
          current={isEditing ? displayName : 'Create tool'}
        />
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
            {isEditing ? 'Save' : 'Create'}
          </Button>
        </div>
      </div>
      <h1 className="text-fg-primary text-xl leading-7">
        {isEditing ? displayName : 'New tool configuration'}
      </h1>
    </header>
  );

  return (
    <div className="content-shell flex min-h-0 w-full flex-1 flex-col gap-5 overflow-hidden">
      {header}

      {pendingMessage && (
        <div
          role="status"
          className="border-stroke-tertiary text-fg-secondary flex-none rounded border border-dashed px-3 py-2 text-sm">
          Pending. {pendingMessage}
        </div>
      )}

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
                    Name {!isViewing && <RequiredMarker />}
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
                    Type {!isViewing && <RequiredMarker />}
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
                    Description {!isViewing && <RequiredMarker />}
                  </FieldTitle>
                  <Textarea
                    autoResize
                    rows={1}
                    placeholder="Tool description"
                    disabled={isDisabled}
                    aria-invalid={!!fieldState.error}
                    className={inlineTextareaClassName}
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
                      URL {!isViewing && <RequiredMarker />}
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
                        Agent {!isViewing && <RequiredMarker />}
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
                        Team {!isViewing && <RequiredMarker />}
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

            {selectedType === 'inline' && (
              <>
                <FormField
                  control={form.control}
                  name="inlineLanguage"
                  render={({ field, fieldState }) => (
                    <FieldSet className="gap-2">
                      <FieldTitle>
                        Language {!isViewing && <RequiredMarker />}
                      </FieldTitle>
                      <Select
                        items={INLINE_LANGUAGE_OPTIONS}
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isDisabled}>
                        <SelectTrigger
                          className={inlineSelectTriggerClassName}
                          aria-invalid={!!fieldState.error}>
                          <SelectValue placeholder="Select language..." />
                        </SelectTrigger>
                        <SelectContent className="bg-fill-onsurface-ui-2">
                          {INLINE_LANGUAGE_OPTIONS.map(item => (
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
                  name="inlineSource"
                  render={({ field, fieldState }) => {
                    const bytes = inlineSourceByteLength(field.value ?? '');
                    return (
                      <FieldSet className="gap-2">
                        <div className="flex items-center justify-between">
                          <FieldTitle>
                            Source {!isViewing && <RequiredMarker />}
                          </FieldTitle>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setIsSourceExpanded(!isSourceExpanded)
                            }
                            className="h-8 gap-1 px-2">
                            <IconShell size="sm" variant="secondary">
                              {isSourceExpanded ? (
                                <CollapseContent />
                              ) : (
                                <ExpandContent />
                              )}
                            </IconShell>
                            {isSourceExpanded ? 'Collapse' : 'Expand'}
                          </Button>
                        </div>
                        <Textarea
                          placeholder="#!/usr/bin/env script body"
                          disabled={isDisabled}
                          aria-invalid={!!fieldState.error}
                          className={jsonTextareaClassName(isSourceExpanded)}
                          {...field}
                        />
                        <FieldDescription>
                          {bytes} / {MAX_INLINE_SOURCE_BYTES} UTF-8 bytes.
                          Standard library only; use an MCPServer for
                          dependencies.
                        </FieldDescription>
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </FieldSet>
                    );
                  }}
                />
              </>
            )}

            <FormField
              control={form.control}
              name="inputSchema"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <div className="flex items-center justify-between">
                    <FieldTitle>
                      Input Schema (JSON) {!isViewing && <RequiredMarker />}
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
