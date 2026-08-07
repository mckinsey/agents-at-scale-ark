'use client';

import { ChevronLeft, Info } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import {
  FieldDescription,
  FieldError,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Form, FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useNamespace } from '@/providers/NamespaceProvider';

import { TagsField } from './tags-field';
import { type ConfigurationFormProps } from './types';
import { useConfigurationForm } from './use-configuration-form';

const RequiredMarker = () => (
  <span aria-hidden="true" className="text-fg-secondary">
    *
  </span>
);

export function ConfigurationForm({
  mode,
  configurationName,
  onSuccess,
}: Readonly<ConfigurationFormProps>) {
  const { readOnlyMode } = useNamespace();
  const { form, isEdit, loading, saving, onSubmit } = useConfigurationForm({
    mode,
    configurationName,
    onSuccess,
  });

  const isDisabled = saving || loading;
  const heading = isEdit ? 'Edit configuration' : 'New configuration';

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full content-shell flex-1 flex-col gap-5 overflow-hidden">
      <header className="flex flex-none flex-col gap-4">
        <div className="flex items-center justify-between">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-sm leading-5 tracking-[-0.112px]">
            <ChevronLeft className="size-4 text-white/30" />
            <NamespacedLink
              href="/configurations"
              className="text-white/30 transition-colors hover:text-white/60">
              Configurations
            </NamespacedLink>
            <span aria-hidden="true" className="text-white/60">
              /
            </span>
            <span aria-current="page" className="text-white/60">
              {heading}
            </span>
          </nav>
          <div className="flex items-center gap-2">
            <NamespacedLink href="/configurations">
              <Button variant="outline">Cancel</Button>
            </NamespacedLink>
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={isDisabled || readOnlyMode}>
              {saving && <Spinner className="mr-2 h-4 w-4" />}
              {isEdit ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
        <h1 className="text-fg-primary text-xl leading-7">{heading}</h1>
      </header>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden pb-2 pl-px">
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
                    placeholder="e.g., github-mcp-url"
                    disabled={isDisabled || isEdit}
                    aria-invalid={!!fieldState.error}
                    {...field}
                  />
                  <FieldDescription>
                    Resources reference the configuration by this name. It
                    cannot be changed after creation.
                  </FieldDescription>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldSet>
              )}
            />

            <FormField
              control={form.control}
              name="value"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <FieldTitle>
                    Value <RequiredMarker />
                  </FieldTitle>
                  <Textarea
                    rows={4}
                    placeholder="e.g., https://api.githubcopilot.com/mcp/"
                    disabled={isDisabled}
                    aria-invalid={!!fieldState.error}
                    {...field}
                  />
                  <FieldDescription>
                    Stored in plain text. Use a Secret for anything sensitive.
                  </FieldDescription>
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldSet>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <FieldTitle>Description</FieldTitle>
                  <Input
                    variant="inline"
                    placeholder="e.g., GitHub remote MCP endpoint"
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
              name="alias"
              render={({ field, fieldState }) => (
                <FieldSet className="gap-2">
                  <FieldTitle className="flex items-center gap-1.5">
                    Alias
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label="What is an alias?"
                          className="text-fg-secondary hover:text-fg-primary">
                          <Info className="size-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-72">
                        A shorter label shown alongside the name in lists.
                        Display only — resources still reference the
                        configuration by its name.
                      </TooltipContent>
                    </Tooltip>
                  </FieldTitle>
                  <Input
                    variant="inline"
                    placeholder="e.g., github-mcp"
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
              name="tags"
              render={({ field }) => (
                <FieldSet className="gap-2">
                  <FieldTitle>Labels</FieldTitle>
                  <TagsField
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isDisabled}
                  />
                </FieldSet>
              )}
            />
          </div>
        </form>
      </Form>
    </div>
  );
}
