'use client';

import type { ReactNode } from 'react';
import type {
  FieldValues,
  SubmitHandler,
  UseFormReturn,
} from 'react-hook-form';

import { ChevronLeft } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Spinner } from '@/components/ui/spinner';

export const RequiredMarker = () => (
  <span aria-hidden="true" className="text-fg-secondary">
    *
  </span>
);

export interface ResourceFormShellProps<TFieldValues extends FieldValues> {
  form: UseFormReturn<TFieldValues>;
  breadcrumbLabel: string;
  breadcrumbHref: string;
  currentLabel: string;
  title: string;
  submitLabel: string;
  onSubmit: SubmitHandler<TFieldValues>;
  saving?: boolean;
  submitDisabled?: boolean;
  onCancel?: () => void;
  children: ReactNode;
  sidePanel?: ReactNode;
}

export function ResourceFormShell<TFieldValues extends FieldValues>({
  form,
  breadcrumbLabel,
  breadcrumbHref,
  currentLabel,
  title,
  submitLabel,
  onSubmit,
  saving = false,
  submitDisabled = false,
  onCancel,
  children,
  sidePanel,
}: Readonly<ResourceFormShellProps<TFieldValues>>) {
  const submit = form.handleSubmit(onSubmit);

  return (
    <div className="content-shell flex min-h-0 w-full flex-1 flex-col gap-5 overflow-hidden">
      {/* Header — figma 4254:21323 (80px tall, 16px gap between rows) */}
      <header className="flex flex-none flex-col gap-4">
        <div className="flex items-center justify-between">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-sm leading-5 tracking-[-0.112px]">
            <ChevronLeft className="size-4 text-white/30" />
            <NamespacedLink
              href={breadcrumbHref}
              className="text-white/30 transition-colors hover:text-white/60">
              {breadcrumbLabel}
            </NamespacedLink>
            <span aria-hidden="true" className="text-white/60">
              /
            </span>
            <span aria-current="page" className="text-white/60">
              {currentLabel}
            </span>
          </nav>
          <div className="flex items-center gap-2">
            {onCancel ? (
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <NamespacedLink href={breadcrumbHref}>
                <Button variant="outline">Cancel</Button>
              </NamespacedLink>
            )}
            <Button onClick={submit} disabled={saving || submitDisabled}>
              {saving && <Spinner className="mr-2 h-4 w-4" />}
              {submitLabel}
            </Button>
          </div>
        </div>
        <h1 className="text-fg-primary text-xl leading-7">{title}</h1>
      </header>

      <Form {...form}>
        <form
          onSubmit={submit}
          className="flex min-h-0 flex-1 items-start gap-20 overflow-hidden pb-2 pl-px">
          {/* Left column — form fields (576px) */}
          <div className="flex max-h-full min-h-0 w-[576px] flex-col gap-6 overflow-y-auto">
            {children}
          </div>

          {sidePanel ? (
            /* Right column — side panel (figma 4257:26496, 464px fixed) */
            <div className="bg-surface-primary flex max-h-full min-h-0 w-[464px] flex-none flex-col overflow-y-auto p-5">
              {sidePanel}
            </div>
          ) : null}
        </form>
      </Form>
    </div>
  );
}
