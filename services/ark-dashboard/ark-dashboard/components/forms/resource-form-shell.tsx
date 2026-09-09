'use client';

import type { ReactNode } from 'react';
import type {
  FieldValues,
  SubmitHandler,
  UseFormReturn,
} from 'react-hook-form';

import { DetailBreadcrumb } from '@/components/common/detail-breadcrumb';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

export const RequiredMarker = () => (
  <span aria-hidden="true" className="text-fg-secondary">
    *
  </span>
);

export interface ResourceFormShellProps<TFieldValues extends FieldValues> {
  form: UseFormReturn<TFieldValues>;
  backHref: string;
  backLabel: string;
  heading: string;
  submitLabel: string;
  onSubmit: SubmitHandler<TFieldValues>;
  loading?: boolean;
  saving?: boolean;
  submitDisabled?: boolean;
  skeletonFields: readonly string[];
  children: ReactNode;
}

export function ResourceFormShell<TFieldValues extends FieldValues>({
  form,
  backHref,
  backLabel,
  heading,
  submitLabel,
  onSubmit,
  loading = false,
  saving = false,
  submitDisabled = false,
  skeletonFields,
  children,
}: Readonly<ResourceFormShellProps<TFieldValues>>) {
  if (loading) {
    return (
      <div
        aria-hidden
        className="content-shell flex w-full flex-1 flex-col gap-6 pt-16">
        {skeletonFields.map(field => (
          <div key={field} className="flex w-[576px] flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    );
  }

  const submit = form.handleSubmit(onSubmit);

  return (
    <div className="content-shell flex min-h-0 w-full flex-1 flex-col gap-5 overflow-hidden">
      <header className="flex flex-none flex-col gap-4">
        <div className="flex items-center justify-between">
          <DetailBreadcrumb
            backHref={backHref}
            backLabel={backLabel}
            current={heading}
          />
          <div className="flex items-center gap-2">
            <NamespacedLink href={backHref}>
              <Button variant="outline">Cancel</Button>
            </NamespacedLink>
            <Button onClick={submit} disabled={saving || submitDisabled}>
              {saving && <Spinner className="mr-2 h-4 w-4" />}
              {submitLabel}
            </Button>
          </div>
        </div>
        <h1 className="text-fg-primary text-xl leading-7">{heading}</h1>
      </header>

      <Form {...form}>
        <form
          onSubmit={submit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden pb-2 pl-px">
          <div className="flex max-h-full min-h-0 w-[576px] flex-col gap-6 overflow-y-auto">
            {children}
          </div>
        </form>
      </Form>
    </div>
  );
}
