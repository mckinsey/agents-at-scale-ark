'use client';

import {
  Copy,
  Download,
  FileCode,
  Network,
  Sparkle,
  Workflow,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import type { Flow } from '@/components/rows/flow-row';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkflowDagViewer } from '@/components/workflow-dag-viewer';
import { workflowTemplatesService } from '@/lib/services/workflow-templates';

export default function FlowDetailPage() {
  const params = useParams();
  const flowId = params.id as string;
  const [flow, setFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFlow() {
      try {
        setLoading(true);
        setError(null);

        const [template, yamlManifest] = await Promise.all([
          workflowTemplatesService.get(flowId),
          workflowTemplatesService.getYaml(flowId),
        ]);

        const annotations = template.metadata.annotations || {};
        const flowData: Flow = {
          id: template.metadata.name,
          title: annotations['workflows.argoproj.io/title'],
          description: annotations['workflows.argoproj.io/description'],
          stages: 0,
          manifest: yamlManifest,
        };

        setFlow(flowData);
      } catch (err) {
        console.error('Failed to fetch workflow template:', err);
        setError('Failed to load flow');
        setFlow(null);
      } finally {
        setLoading(false);
      }
    }

    fetchFlow();
  }, [flowId]);

  const breadcrumbs: BreadcrumbElement[] = [
    { href: '/', label: 'ARK Dashboard' },
    { href: '/workflow-templates', label: 'Workflow Templates' },
  ];

  if (loading) {
    return (
      <>
        <PageHeader breadcrumbs={breadcrumbs} currentPage="Loading..." />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">Loading flow...</p>
        </div>
      </>
    );
  }

  if (error || !flow) {
    return (
      <>
        <PageHeader breadcrumbs={breadcrumbs} currentPage="Flow Not Found" />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">{error || 'Flow not found'}</p>
        </div>
      </>
    );
  }

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(flow.id);
      toast.success('Copied', {
        description: 'Flow ID copied to clipboard',
      });
    } catch {
      toast.error('Failed to copy', {
        description: 'Could not copy flow ID to clipboard',
      });
    }
  };

  const handleCopyManifest = async () => {
    if (!flow.manifest) return;
    try {
      await navigator.clipboard.writeText(flow.manifest);
      toast.success('Copied', {
        description: 'Manifest copied to clipboard',
      });
    } catch {
      toast.error('Failed to copy', {
        description: 'Could not copy manifest to clipboard',
      });
    }
  };

  const handleDownloadManifest = () => {
    if (!flow.manifest) return;
    const blob = new Blob([flow.manifest], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flow.id}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isComposerFlow = !!(flow.title && flow.description);

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage={flow.title || flow.id}
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="bg-card flex w-full flex-wrap items-center gap-4 rounded-md border px-4 py-3">
          <div className="flex flex-grow items-center gap-3 overflow-hidden">
            <div className="relative p-2">
              <Workflow className="text-muted-foreground h-8 w-8 flex-shrink-0" />
              {isComposerFlow && (
                <Sparkle className="fill-primary text-primary absolute -top-0.5 -right-0.5 h-3.5 w-3.5 opacity-60" />
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-2">
                <p
                  className="truncate font-mono text-base font-medium"
                  title={flow.id}>
                  {flow.id}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 cursor-pointer"
                  onClick={handleCopyId}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              {flow.title && (
                <p
                  className="text-muted-foreground truncate text-sm font-medium"
                  title={flow.title}>
                  {flow.title}
                </p>
              )}
              {flow.description && (
                <p
                  className="text-muted-foreground truncate text-sm"
                  title={flow.description}>
                  {flow.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-muted-foreground flex items-center gap-1 text-sm">
              <span className="font-medium">{flow.stages}</span>
              <span>{flow.stages === 1 ? 'stage' : 'stages'}</span>
            </div>
          </div>
        </div>

        {flow.manifest && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle>Workflow Manifest</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={handleCopyManifest}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={handleDownloadManifest}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="yaml">
                <TabsList>
                  <TabsTrigger value="yaml">
                    <FileCode className="mr-2 h-4 w-4" />
                    YAML
                  </TabsTrigger>
                  <TabsTrigger value="tree">
                    <Network className="mr-2 h-4 w-4" />
                    Tree
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="yaml">
                  <pre className="bg-muted overflow-x-auto rounded-lg p-4 font-mono text-xs">
                    <code>{flow.manifest}</code>
                  </pre>
                </TabsContent>
                <TabsContent value="tree">
                  <WorkflowDagViewer manifest={flow.manifest} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
