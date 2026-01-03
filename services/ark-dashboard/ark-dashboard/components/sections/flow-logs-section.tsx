'use client';

import { ArrowUpRight, ExternalLink, FileText, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  checkArgoAvailable,
  getArgoBaseUrl,
  workflowTemplatesService,
} from '@/lib/services/flows';
import type { WorkflowRun, WorkflowTemplate } from '@/lib/types/flow';
import { formatAge } from '@/lib/utils/time';

const ARGO_DOCS_URL =
  'https://github.com/mckinsey/agents-at-scale/tree/main/services/argo-workflows';

type PhaseType = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Error';

const phaseColors: Record<PhaseType, string> = {
  Pending: 'bg-gray-500',
  Running: 'bg-blue-500 animate-pulse',
  Succeeded: 'bg-green-500',
  Failed: 'bg-red-500',
  Error: 'bg-red-500',
};

export function FlowLogsSection() {
  const [workflows, setWorkflows] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [argoBaseUrl, setArgoBaseUrl] = useState('http://localhost:2746');
  const [argoAvailable, setArgoAvailable] = useState<boolean | null>(null);

  const [namespaces] = useState(['default', 'argo-workflows']);
  const [selectedNamespace, setSelectedNamespace] = useState('__all__');

  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('__all__');

  const loadTemplates = async () => {
    const [defaultTemplates, argoTemplates] = await Promise.all([
      workflowTemplatesService.getAll('default'),
      workflowTemplatesService.getAll('argo-workflows'),
    ]);
    setTemplates([...defaultTemplates, ...argoTemplates]);
  };

  const loadWorkflows = async (namespace: string, template: string) => {
    try {
      const params = new URLSearchParams();
      if (namespace !== '__all__') params.set('namespace', namespace);
      if (template !== '__all__') params.set('templateName', template);

      const response = await fetch(`/api/argo/workflows?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setWorkflows(data);
      }
    } catch (error) {
      console.error('Failed to load workflows:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const available = await checkArgoAvailable();
      setArgoAvailable(available);
      if (!available) {
        setLoading(false);
        return;
      }
      const baseUrl = await getArgoBaseUrl();
      setArgoBaseUrl(baseUrl);
      await loadTemplates();
      await loadWorkflows('__all__', '__all__');
      setLoading(false);
    };
    init();
  }, []);

  const handleNamespaceChange = async (value: string) => {
    setSelectedNamespace(value);
    setSelectedTemplate('__all__');
    await loadWorkflows(value, '__all__');
  };

  const handleTemplateChange = async (value: string) => {
    setSelectedTemplate(value);
    await loadWorkflows(selectedNamespace, value);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadWorkflows(selectedNamespace, selectedTemplate);
    setRefreshing(false);
  };

  const getArgoUrl = (workflow: WorkflowRun) => {
    return `${argoBaseUrl}/workflows/${workflow.namespace}/${workflow.name}`;
  };

  const filteredTemplates =
    selectedNamespace === '__all__'
      ? templates
      : templates.filter(t => t.namespace === selectedNamespace);
  const uniqueTemplates = [...new Set(filteredTemplates.map(t => t.name))];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (argoAvailable === false) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText className="h-10 w-10" />
          </EmptyMedia>
          <EmptyTitle>Argo Workflows Not Available</EmptyTitle>
          <EmptyDescription>
            Flow logs require Argo Workflows to be deployed in your cluster.
            Once Argo is installed, you can view workflow execution logs here.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" asChild>
            <a href={ARGO_DOCS_URL} target="_blank" rel="noopener noreferrer">
              View Argo Setup Documentation
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Namespace:</span>
            <Select
              value={selectedNamespace}
              onValueChange={handleNamespaceChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All namespaces" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All namespaces</SelectItem>
                {namespaces.map(ns => (
                  <SelectItem key={ns} value={ns}>
                    {ns}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Template:</span>
            <Select
              value={selectedTemplate}
              onValueChange={handleTemplateChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All templates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All templates</SelectItem>
                {uniqueTemplates.map(name => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                <th className="px-4 py-3 text-left text-sm font-medium">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium">
                  Namespace
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium">
                  Template
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium">
                  Started
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {workflows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-muted-foreground px-4 py-8 text-center">
                    No workflow runs found
                  </td>
                </tr>
              ) : (
                workflows.map(workflow => {
                  const phase = workflow.phase as PhaseType;
                  const phaseColor = phaseColors[phase] || 'bg-gray-400';
                  const duration = workflow.finishedAt
                    ? Math.round(
                        (new Date(workflow.finishedAt).getTime() -
                          new Date(workflow.startedAt).getTime()) /
                          1000,
                      )
                    : null;

                  return (
                    <tr
                      key={`${workflow.namespace}-${workflow.name}`}
                      className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900/30">
                      <td className="px-4 py-3 font-mono text-sm">
                        <Link
                          href={`/flow-logs/${workflow.namespace}/${workflow.name}`}
                          className="text-blue-600 hover:underline dark:text-blue-400">
                          {workflow.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">
                          {workflow.namespace}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {workflow.templateName || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-2 w-2 rounded-full ${phaseColor}`}
                          />
                          <span>{workflow.phase}</span>
                        </div>
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-sm">
                        {formatAge(workflow.startedAt)}
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-sm">
                        {duration !== null ? `${duration}s` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            window.open(getArgoUrl(workflow), '_blank')
                          }>
                          <ExternalLink className="mr-1 h-4 w-4" />
                          View in Argo
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
