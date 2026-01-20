'use client';

import {
  Copy,
  Download,
  ExternalLink,
  FileCode,
  Network,
  Play,
  Workflow,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { WorkflowStatsCard } from '@/components/cards/workflow-stats-card';
import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import type { Flow } from '@/components/rows/flow-row';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkflowDagViewer } from '@/components/workflow-dag-viewer';
import {
  type WorkflowStats,
  workflowTemplatesService,
} from '@/lib/services/workflow-templates';
import { countWorkflowTasks } from '@/lib/utils/workflow';

export default function FlowDetailPage() {
  const params = useParams();
  const flowId = params.id as string;
  const [flow, setFlow] = useState<Flow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

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
        const stages = countWorkflowTasks(template.spec);
        const flowData: Flow = {
          id: template.metadata.name,
          title: annotations['workflows.argoproj.io/title'],
          description: annotations['workflows.argoproj.io/description'],
          stages,
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

    async function fetchStats() {
      try {
        setStatsLoading(true);
        const workflowStats = await workflowTemplatesService.getStats(flowId);
        setStats(workflowStats);
      } catch (err) {
        console.error('Failed to fetch workflow stats:', err);
        setStats(null);
      } finally {
        setStatsLoading(false);
      }
    }

    fetchFlow();
    fetchStats();
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

  const handleCopyWorkflowName = async () => {
    try {
      await navigator.clipboard.writeText(flowId);
      toast.success('Copied', {
        description: 'Workflow name copied to clipboard',
      });
    } catch {
      toast.error('Failed to copy', {
        description: 'Could not copy workflow name to clipboard',
      });
    }
  };

  const handleRunWorkflow = async () => {
    try {
      const workflow = await workflowTemplatesService.run(flowId);
      toast.success('Workflow started', {
        description: `Created workflow: ${workflow.metadata.name}`,
      });

      const workflowStats = await workflowTemplatesService.getStats(flowId);
      setStats(workflowStats);
    } catch (err) {
      console.error('Failed to start workflow:', err);
      toast.error('Failed to start workflow', {
        description:
          err instanceof Error ? err.message : 'An unknown error occurred',
      });
    }
  };

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage={flow.title || flow.id}
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="bg-card flex w-full flex-wrap items-center gap-4 rounded-md border px-4 py-3">
          <div className="flex flex-grow items-center gap-3 overflow-hidden">
            <div className="p-2">
              <Workflow className="text-muted-foreground h-8 w-8 flex-shrink-0" />
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
                  onClick={handleCopyWorkflowName}>
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
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 cursor-pointer p-0"
                asChild>
                <a
                  href={`http://argo.127.0.0.1.nip.io:8080/workflow-templates/default/${flowId}`}
                  target="_blank"
                  rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 cursor-pointer p-0"
                onClick={handleRunWorkflow}>
                <Play className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <WorkflowStatsCard
          templateName={flowId}
          stats={stats}
          isLoading={statsLoading}
        />

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
