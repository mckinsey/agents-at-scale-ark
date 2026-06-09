'use client';

import { useParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { ChevronLeft } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { toolsService } from '@/lib/services';
import type { ToolDetail } from '@/lib/services/tools';

function DetailSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <h2 className="text-fg-secondary border-stroke-tertiary border-b pb-3 text-sm leading-5 tracking-[-0.112px]">
        {title}
      </h2>
      <dl className="flex flex-col">{children}</dl>
    </section>
  );
}

function DetailRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="border-stroke-tertiary flex flex-col gap-1 border-b px-3 py-4 sm:flex-row sm:gap-4">
      <dt className="text-fg-secondary w-[240px] shrink-0 text-sm leading-5 tracking-[-0.112px]">
        {label}
      </dt>
      <dd className="text-fg-primary min-w-0 flex-1 text-sm leading-5 tracking-[-0.112px]">
        {children}
      </dd>
    </div>
  );
}

export default function ToolDetailsPage() {
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<ToolDetail | null>(null);
  const toolName = params.name as string;

  useEffect(() => {
    const fetchTool = async () => {
      if (!toolName) return;

      setLoading(true);
      try {
        const toolData = await toolsService.getDetail(toolName);
        setTool(toolData);
      } catch (error) {
        console.error('Failed to fetch tool details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTool();
  }, [toolName]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-none flex-col gap-4 pb-5">
        <div className="flex items-center justify-between">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1 text-sm leading-5 tracking-[-0.112px]">
            <NamespacedLink
              href="/tools"
              className="text-fg-disabled hover:text-fg-secondary flex items-center gap-1 transition-colors">
              <IconShell size="sm" className="opacity-100">
                <ChevronLeft />
              </IconShell>
              Tools
            </NamespacedLink>
            <span aria-hidden="true" className="text-fg-secondary">
              /
            </span>
            <span aria-current="page" className="text-fg-secondary">
              {toolName}
            </span>
          </nav>
          <NamespacedLink href="/tools">
            <Button variant="outline">Back</Button>
          </NamespacedLink>
        </div>
        <h1 className="text-fg-primary text-xl leading-7">{toolName}</h1>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      ) : !tool ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-fg-secondary">Tool not found</div>
        </div>
      ) : (
        <ScrollArea className="h-0 min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
          <div className="mx-auto flex w-full max-w-[1344px] flex-col gap-8 pb-6">
            <DetailSection title="Tool description">
              <DetailRow label="Name">{toolName}</DetailRow>
              <DetailRow label="Description">
                {tool.description || '—'}
              </DetailRow>
              <DetailRow label="Tool type">{tool.spec?.type || '—'}</DetailRow>
            </DetailSection>

            <DetailSection title="Annotations and metadata">
              <DetailRow label="Status">
                {JSON.stringify(tool.status?.state)}
              </DetailRow>
              <DetailRow label="Input schema">
                <pre className="bg-surface-secondary text-fg-primary overflow-x-auto p-3 font-mono text-xs leading-5 whitespace-pre-wrap">
                  {JSON.stringify(tool.spec?.inputSchema, null, 2)}
                </pre>
              </DetailRow>
            </DetailSection>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
