'use client';

import {
  BarChart,
  Bot,
  CheckCircle,
  Download,
  Loader2,
  Search,
  Server,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ExportItem, ResourceExportData } from '@/lib/services/export';
import { exportService } from '@/lib/services/export';

type ResourceType = keyof ResourceExportData;

interface ResourceSection {
  type: ResourceType;
  title: string;
  description: string;
  icon: React.ElementType;
}

const resourceSections: ResourceSection[] = [
  {
    type: 'agents',
    title: 'Agents',
    description: 'AI agent configurations and prompts',
    icon: Bot,
  },
  {
    type: 'teams',
    title: 'Teams',
    description: 'Team configurations and hierarchies',
    icon: Users,
  },
  {
    type: 'models',
    title: 'Models',
    description: 'Model configurations and parameters',
    icon: Zap,
  },
  {
    type: 'queries',
    title: 'Queries',
    description: 'Query configurations and templates',
    icon: Search,
  },
  {
    type: 'a2a',
    title: 'A2A Servers',
    description: 'Agent-to-Agent server configurations',
    icon: Server,
  },
  {
    type: 'mcpservers',
    title: 'MCP Servers',
    description: 'Model Context Protocol server configs',
    icon: Server,
  },
  {
    type: 'workflows',
    title: 'Workflows',
    description: 'Workflow definitions and templates',
    icon: Workflow,
  },
  {
    type: 'evaluators',
    title: 'Evaluators',
    description: 'Evaluation criteria and metrics',
    icon: CheckCircle,
  },
  {
    type: 'evaluations',
    title: 'Evaluations',
    description: 'Evaluation results and reports',
    icon: BarChart,
  },
];

// Helper function to get abbreviated title for mobile view
const getAbbreviatedTitle = (type: ResourceType, title: string): string => {
  switch (type) {
    case 'evaluations':
      return 'Evaluations';
    case 'evaluators':
      return 'Evaluators';
    case 'workflows':
      return 'Flows';
    default:
      return title.slice(0, 5);
  }
};

export default function ExportPage() {
  const [resources, setResources] = useState<ResourceExportData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [activeTab, setActiveTab] = useState<ResourceType>('agents');
  const [lastExportTime, setLastExportTime] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadResources();
    // Load last export time from localStorage
    exportService.getLastExportTime().then(lastTime => {
      setLastExportTime(lastTime);
    });
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

  const handleExport = async (exportAll: boolean = false) => {
    // Validate selection if not exporting all
    if (!exportAll && selectedCount === 0) {
      toast.error('No resources selected', {
        description: 'Please select at least one resource to export',
      });
      return;
    }

    try {
      setIsExporting(true);

      // Call appropriate export service method
      if (exportAll) {
        await exportService.exportAll();
        toast.success('Export successful', {
          description: 'Successfully exported all resources',
        });
      } else {
        await exportService.exportResources(resources);
        toast.success('Export successful', {
          description: `Successfully exported ${selectedCount} resources`,
        });
      }

      // Update last export time
      exportService.getLastExportTime().then(time => setLastExportTime(time));
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

  const formatLastExportTime = () => {
    if (!lastExportTime) {
      return 'Never';
    }
    const date = new Date(lastExportTime);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderResourceSection = (section: ResourceSection) => {
    const allItems = resources[section.type] ?? [];

    // Filter items based on search query
    const items = searchQuery
      ? allItems.filter(item =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : allItems;

    const selectedItems = items.filter(item => item.selected);
    const allSelected =
      items.length > 0 && selectedItems.length === items.length;
    const Icon = section.icon;

    return (
      <div key={section.type} className="space-y-4">
        {items.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={checked =>
                  handleSelectAll(section.type, !!checked)
                }
              />
              <span className="text-sm">
                Select all ({selectedItems.length} of {items.length})
              </span>
            </div>
            <Separator className="my-4" />
          </>
        )}
        <div>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No {section.title.toLowerCase()} found
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map(item => (
                <div
                  key={item.id}
                  className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-lg border p-2 sm:gap-3 sm:p-3"
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    handleSelectItem(section.type, item.id, !item.selected)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSelectItem(section.type, item.id, !item.selected)
                    }
                  }}>
                  <Checkbox
                    checked={item.selected ?? false}
                    onCheckedChange={checked =>
                      handleSelectItem(section.type, item.id, !!checked)
                    }
                    className="h-3 w-3 sm:h-4 sm:w-4"
                  />
                  <Icon className="text-muted-foreground h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="flex-1 truncate text-xs sm:text-sm">
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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

  return (
    <>
      <PageHeader currentPage="Exports" />

      <div className="flex flex-1 flex-col space-y-6">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Exports</h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">
            Export your Ark resources to YAML files for backup or version
            control.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle>Select Resources to Export</CardTitle>
              <CardDescription>
                Choose specific resource to export individually or in groups
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
              <Button
                onClick={() => handleExport(true)}
                disabled={isExporting || totalCount === 0}
                variant="outline"
                className="w-full sm:w-auto">
                {isExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export All ({totalCount})
              </Button>
              <Button
                onClick={() => handleExport(false)}
                disabled={isExporting || selectedCount === 0}
                variant="default"
                className="w-full sm:w-auto">
                {isExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export Selected ({selectedCount})
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Separator className="mb-4" />
            {lastExportTime && (
              <div className="text-muted-foreground mb-4 text-sm">
                Last export: {formatLastExportTime()}
              </div>
            )}
            <div className="relative mb-4">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Search resources in current tab"
                className="pl-9"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <Tabs
              value={activeTab}
              onValueChange={value => setActiveTab(value as ResourceType)}>
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
                {resourceSections.map(section => {
                  const allItems = resources[section.type] ?? [];
                  // Filter items based on search query
                  const filteredItems = searchQuery
                    ? allItems.filter(item =>
                        item.name
                          .toLowerCase()
                          .includes(searchQuery.toLowerCase()),
                      )
                    : allItems;
                  const Icon = section.icon;
                  return (
                    <TabsTrigger
                      key={section.type}
                      value={section.type}
                      className="flex h-auto min-h-[32px] flex-shrink-0 items-center gap-1 px-2 py-1.5 text-xs sm:gap-1.5 sm:px-3 sm:text-sm">
                      <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="hidden sm:inline">{section.title}</span>
                      <span className="sm:hidden">
                        {getAbbreviatedTitle(section.type, section.title)}
                      </span>
                      <span className="text-[10px] opacity-70 sm:text-xs">
                        ({filteredItems.length})
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {resourceSections.map(section => (
                <TabsContent
                  key={section.type}
                  value={section.type}
                  className="mt-4 space-y-4">
                  {renderResourceSection(section)}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
