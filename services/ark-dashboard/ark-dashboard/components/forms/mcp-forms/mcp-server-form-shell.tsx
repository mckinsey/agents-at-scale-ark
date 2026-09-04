'use client';

import type { ReactNode } from 'react';

import { DetailBreadcrumb } from '@/components/common/detail-breadcrumb';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useNamespace } from '@/providers/NamespaceProvider';

interface McpServerFormShellProps {
  readonly formId: string;
  readonly breadcrumbCurrent: string;
  readonly title: string;
  readonly subtitle: string;
  readonly isSubmitting: boolean;
  readonly submitLabel: string;
  readonly submittingLabel: string;
  readonly children: ReactNode;
}

export function McpServerFormShell({
  formId,
  breadcrumbCurrent,
  title,
  subtitle,
  isSubmitting,
  submitLabel,
  submittingLabel,
  children,
}: McpServerFormShellProps) {
  const { readOnlyMode } = useNamespace();

  return (
    <div className="content-shell flex min-h-0 w-full flex-1 flex-col gap-5 overflow-hidden">
      <header className="flex flex-none flex-col gap-4">
        <div className="flex items-center justify-between">
          <DetailBreadcrumb
            backHref="/mcp"
            backLabel="MCPs"
            current={breadcrumbCurrent}
          />
          <div className="flex items-center gap-2">
            <NamespacedLink href="/mcp">
              <Button variant="outline">Cancel</Button>
            </NamespacedLink>
            <Button
              type="submit"
              form={formId}
              disabled={isSubmitting || readOnlyMode}>
              {isSubmitting && <Spinner className="mr-2 h-4 w-4" />}
              {isSubmitting ? submittingLabel : submitLabel}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-fg-primary text-xl leading-7">{title}</h1>
          <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
            {subtitle}
          </p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 overflow-auto pb-2 pl-px">
        <div className="flex w-[576px] flex-col">{children}</div>
      </div>
    </div>
  );
}
