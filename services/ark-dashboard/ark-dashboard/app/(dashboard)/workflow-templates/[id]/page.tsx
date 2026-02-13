'use client';

import {
  Copy,
  Download,
  ExternalLink,
  FileCode,
  Network,
  Play,
  Trash2,
  Workflow,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { WorkflowStatsCard } from '@/components/cards/workflow-stats-card';
import { CodeViewer } from '@/components/code-viewer';
import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { DeleteWorkflowTemplateDialog } from '@/components/dialogs/delete-workflow-template-dialog';
import { RunWorkflowDialog } from '@/components/dialogs/run-workflow-dialog';
import type { Flow } from '@/components/rows/flow-row';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSidebar } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { WorkflowDagViewer } from '@/components/workflow-dag-viewer';
import {
  type WorkflowStats,
  type WorkflowTemplate,
  workflowTemplatesService,
} from '@/lib/services/workflow-templates';
import { countWorkflowTasks } from '@/lib/utils/workflow';
import { showWorkflowStartedToast } from '@/lib/utils/workflow-toast';
import { useNamespace } from '@/providers/NamespaceProvider';

const ARGO_BASE_URL =
  process.env.NEXT_PUBLIC_ARGO_URL || 'http://localhost:2746';

export default function FlowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { state: sidebarState, isMobile } = useSidebar();
  const { namespace, readOnlyMode } = useNamespace();
  const flowId = params.id as string;
  const [flow, setFlow] = useState<Flow | null>(null);
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('tree');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    async function fetchFlow() {
      try {
        setLoading(true);
        setError(null);

        const [templateData, yamlManifest] = await Promise.all([
          workflowTemplatesService.get(flowId),
          workflowTemplatesService.getYaml(flowId),
        ]);

        setTemplate(templateData);

        const annotations = templateData.metadata.annotations || {};
        const stages = countWorkflowTasks(templateData.spec);
        const flowData: Flow = {
          id: templateData.metadata.name,
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

    async function fetchStats(showLoading = true) {
      try {
        if (showLoading) {
          setStatsLoading(true);
        }
        const workflowStats = await workflowTemplatesService.getStats(flowId);
        setStats(workflowStats);
      } catch (err) {
        console.error('Failed to fetch workflow stats:', err);
        setStats(null);
      } finally {
        if (showLoading) {
          setStatsLoading(false);
        }
      }
    }

    fetchFlow();
    fetchStats();

    const statsInterval = setInterval(() => {
      fetchStats(false);
    }, 30000);

    return () => {
      clearInterval(statsInterval);
    };
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
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(flow.manifest);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = flow.manifest;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
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
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(flowId);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = flowId;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      toast.success('Copied', {
        description: 'Workflow name copied to clipboard',
      });
    } catch {
      toast.error('Failed to copy', {
        description: 'Could not copy workflow name to clipboard',
      });
    }
  };

  const handleRunWorkflow = async (
    parameters?: Record<string, string>,
    workflowName?: string,
  ) => {
    try {
      const workflow = await workflowTemplatesService.run(
        flowId,
        parameters,
        workflowName,
      );
      showWorkflowStartedToast(workflow.metadata.name);

      if (stats) {
        setStats({
          total: stats.total + 1,
          succeeded: stats.succeeded,
          running: stats.running + 1,
          failed: stats.failed,
        });
      }

      setTimeout(async () => {
        const workflowStats = await workflowTemplatesService.getStats(flowId);
        setStats(workflowStats);
      }, 1000);
    } catch (err) {
      console.error('Failed to start workflow:', err);
      toast.error('Failed to start workflow', {
        description:
          err instanceof Error ? err.message : 'An unknown error occurred',
      });
      throw err;
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    try {
      await workflowTemplatesService.delete(flowId);
      toast.success('Workflow template deleted', {
        description: `Deleted workflow template: ${flowId}`,
      });
      router.push('/workflow-templates');
    } catch (err) {
      console.error('Failed to delete workflow template:', err);
      toast.error('Failed to delete workflow template', {
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
      <div
        className="flex flex-col gap-6 p-6"
        style={
          !isMobile && sidebarState === 'expanded'
            ? { maxWidth: 'calc(100vw - 16rem)' }
            : undefined
        }>
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
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 cursor-pointer p-0"
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 cursor-pointer p-0"
                      asChild>
                      <a
                        href={`${ARGO_BASE_URL}/workflow-templates/${namespace}/${flowId}`}
                        target="_blank"
                        rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open in Argo</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 cursor-pointer p-0"
                      disabled={readOnlyMode}
                      onClick={handleDeleteClick}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {readOnlyMode
                      ? 'Delete disabled in demo mode'
                      : 'Delete template'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {template && (
                <TooltipProvider>
                  <Tooltip>
                    <RunWorkflowDialog
                      templateName={flowId}
                      parameters={template.spec?.arguments?.parameters}
                      onRun={handleRunWorkflow}
                      trigger={
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 cursor-pointer p-0">
                            <Play className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                      }
                    />
                    <TooltipContent>Run workflow</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
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
                  onClick={handleCopyManifest}
                  style={{
                    visibility: activeTab === 'yaml' ? 'visible' : 'hidden',
                    transitionProperty: 'background-color, border-color, color',
                  }}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={handleDownloadManifest}
                  style={{
                    visibility: activeTab === 'yaml' ? 'visible' : 'hidden',
                    transitionProperty: 'background-color, border-color, color',
                  }}>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="tree" className="cursor-pointer">
                    <Network className="mr-2 h-4 w-4" />
                    Tree
                  </TabsTrigger>
                  <TabsTrigger value="yaml" className="cursor-pointer">
                    <FileCode className="mr-2 h-4 w-4" />
                    YAML
                  </TabsTrigger>
                </TabsList>
                <TabsContent
                  value="tree"
                  forceMount
                  tabIndex={-1}
                  className={activeTab !== 'tree' ? 'hidden' : ''}>
                  <WorkflowDagViewer manifest={flow.manifest} />
                </TabsContent>
                <TabsContent
                  value="yaml"
                  forceMount
                  tabIndex={-1}
                  className={activeTab !== 'yaml' ? 'hidden' : ''}>
                  <CodeViewer code={flow.manifest} language="yaml" />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>

      <DeleteWorkflowTemplateDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        templateName={flowId}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
