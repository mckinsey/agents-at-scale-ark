'use client';

import { CheckCircle, Download, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/common/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ExportItem, ResourceExportData } from '@/lib/services/export';
import { exportService } from '@/lib/services/export';

type ResourceType = keyof ResourceExportData;

interface ResourceSection {
  type: ResourceType;
  title: string;
  description: string;
  priority: 1 | 2 | 3;
}

const resourceSections: ResourceSection[] = [
  {
    type: 'agents',
    title: 'Agents',
    description: 'AI agent configurations and prompts',
    priority: 1,
  },
  {
    type: 'models',
    title: 'Models',
    description: 'Model configurations and parameters',
    priority: 1,
  },
  {
    type: 'secrets',
    title: 'Secrets',
    description: 'Secret references (values not included)',
    priority: 1,
  },
  {
    type: 'teams',
    title: 'Teams',
    description: 'Team configurations and hierarchies',
    priority: 2,
  },
  {
    type: 'a2a',
    title: 'Agent-to-Agent',
    description: 'A2A server configurations',
    priority: 2,
  },
  {
    type: 'mcp',
    title: 'MCP Servers',
    description: 'Model Context Protocol server configs',
    priority: 2,
  },
  {
    type: 'evaluators',
    title: 'Evaluators',
    description: 'Evaluation criteria and metrics',
    priority: 2,
  },
  {
    type: 'memory',
    title: 'Memory',
    description: 'Memory store configurations',
    priority: 2,
  },
  {
    type: 'workflows',
    title: 'Workflow Templates',
    description: 'Workflow definitions and templates',
    priority: 3,
  },
  {
    type: 'evaluations',
    title: 'Evaluations',
    description: 'Evaluation results and reports',
    priority: 3,
  },
];

export default function ExportPage() {
  const [resources, setResources] = useState<ResourceExportData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'priority-1' | 'priority-2' | 'priority-3'>('priority-1');

  useEffect(() => {
    loadResources();
  }, []);

  useEffect(() => {
    // Count selected items
    let count = 0;
    for (const items of Object.values(resources)) {
      if (items) {
        count += items.filter((item: ExportItem) => item.selected).length;
      }
    }
    setSelectedCount(count);
  }, [resources]);

  const loadResources = async () => {
    try {
      setIsLoading(true);
      const data = await exportService.fetchAllResources();

      // Initialize all items as unselected
      const initializedData: ResourceExportData = {};
      for (const [key, items] of Object.entries(data)) {
        if (items && Array.isArray(items)) {
          initializedData[key as ResourceType] = items.map(item => ({
            ...item,
            selected: false,
          }));
        }
      }

      setResources(initializedData);
    } catch (error) {
      toast.error('Failed to load resources', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAll = (type: ResourceType, checked: boolean) => {
    setResources(prev => ({
      ...prev,
      [type]: prev[type]?.map(item => ({ ...item, selected: checked })),
    }));
  };

  const handleSelectItem = (
    type: ResourceType,
    itemId: string,
    checked: boolean,
  ) => {
    setResources(prev => ({
      ...prev,
      [type]: prev[type]?.map(item =>
        item.id === itemId ? { ...item, selected: checked } : item,
      ),
    }));
  };

  const handleExportSelected = async () => {
    if (selectedCount === 0) {
      toast.error('No resources selected', {
        description: 'Please select at least one resource to export',
      });
      return;
    }

    try {
      setIsExporting(true);
      await exportService.exportResources(resources);
      toast.success('Export successful', {
        description: `Successfully exported ${selectedCount} resources`,
      });
    } catch (error) {
      toast.error('Export failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAll = async () => {
    try {
      setIsExporting(true);
      await exportService.exportAll();
      toast.success('Export successful', {
        description: 'Successfully exported all resources',
      });
    } catch (error) {
      toast.error('Export failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const getTotalCount = () => {
    let total = 0;
    for (const items of Object.values(resources)) {
      if (items) {
        total += items.length;
      }
    }
    return total;
  };

  const renderResourceSection = (section: ResourceSection) => {
    const items = resources[section.type] || [];
    const selectedItems = items.filter(item => item.selected);
    const allSelected =
      items.length > 0 && selectedItems.length === items.length;

    return (
      <Card key={section.type} className="relative">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{section.title}</CardTitle>
              <span className="text-muted-foreground text-sm">
                ({selectedItems.length}/{items.length})
              </span>
            </div>
            {items.length > 0 && (
              <Checkbox
                checked={allSelected}
                onCheckedChange={checked =>
                  handleSelectAll(section.type, !!checked)
                }
              />
            )}
          </div>
          <CardDescription className="mt-1 text-sm">
            {section.description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No {section.title.toLowerCase()} found
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(item => (
                <div
                  key={item.id}
                  className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded p-2"
                  onClick={() =>
                    handleSelectItem(section.type, item.id, !item.selected)
                  }>
                  <Checkbox
                    checked={item.selected || false}
                    onCheckedChange={checked =>
                      handleSelectItem(section.type, item.id, !!checked)
                    }
                  />
                  <span className="flex-1 truncate text-sm">{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const totalCount = getTotalCount();
  const exportProgress =
    totalCount > 0 ? (selectedCount / totalCount) * 100 : 0;

  return (
    <div className="flex-1 space-y-6">
      <PageHeader currentPage="Export Resources" />

      <div className="mx-auto max-w-7xl space-y-6 p-6">
        {/* Export Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Export Configuration</CardTitle>
            <CardDescription>
              Select resources to export as YAML files. Exported files will be
              organized in folders and packaged as a ZIP archive.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {selectedCount} of {totalCount} resources selected
                </p>
                <Progress value={exportProgress} className="w-48" />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleExportSelected}
                  disabled={isExporting || selectedCount === 0}
                  variant="default">
                  {isExporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Export Selected ({selectedCount})
                </Button>
                <Button
                  onClick={handleExportAll}
                  disabled={isExporting || totalCount === 0}
                  variant="outline">
                  {isExporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Export All
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info Alert */}
        <Alert>
          <AlertDescription>
            Exported resources will be saved as YAML files in a ZIP archive.
            Secret values are not included in exports for security reasons. The
            archive will be organized with folders for each resource type
            (agents/, models/, secrets/, etc.).
          </AlertDescription>
        </Alert>

        {/* Resources in Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="priority-1" className="flex items-center gap-2">
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900 dark:text-red-200">
                Priority 1
              </span>
              Core Resources
            </TabsTrigger>
            <TabsTrigger value="priority-2" className="flex items-center gap-2">
              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200">
                Priority 2
              </span>
              Supporting Resources
            </TabsTrigger>
            <TabsTrigger value="priority-3" className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                Priority 3
              </span>
              Operational Resources
            </TabsTrigger>
          </TabsList>

          <TabsContent value="priority-1" className="space-y-4 mt-4">
            <div className="grid gap-4">
              {resourceSections
                .filter(s => s.priority === 1)
                .map(renderResourceSection)}
            </div>
          </TabsContent>

          <TabsContent value="priority-2" className="space-y-4 mt-4">
            <div className="grid gap-4">
              {resourceSections
                .filter(s => s.priority === 2)
                .map(renderResourceSection)}
            </div>
          </TabsContent>

          <TabsContent value="priority-3" className="space-y-4 mt-4">
            <div className="grid gap-4">
              {resourceSections
                .filter(s => s.priority === 3)
                .map(renderResourceSection)}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}