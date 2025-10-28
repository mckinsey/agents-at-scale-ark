'use client';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@radix-ui/react-collapsible';
import { Label } from '@radix-ui/react-label';
import { ArrowUpRightIcon, ChevronRight, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';

import { ToolCard } from '@/components/cards';
import { InfoDialog } from '@/components/dialogs/info-dialog';
import { ToolEditor } from '@/components/editors/tool-editor';
import { ToolRow } from '@/components/rows/tool-row';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { type ToggleOption, ToggleSwitch } from '@/components/ui/toggle-switch';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { useDelayedLoading } from '@/lib/hooks';
import {
  type Agent,
  type AgentTool,
  type Tool,
  agentsService,
  toolsService,
} from '@/lib/services';
import { groupToolsByLabel } from '@/lib/utils/groupToolsByLabels';

interface ToolsSectionProps {
  namespace: string;
}

export const ToolsSection = forwardRef<
  { openAddEditor: () => void },
  ToolsSectionProps
>(function ToolsSection({ namespace }, ref) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoading = useDelayedLoading(loading);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [showCompactView, setShowCompactView] = useState(false);
  const router = useRouter();
  const [toolEditorOpen, setToolEditorOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    openAddEditor: () => setToolEditorOpen(true),
  }));

  const viewOptions: ToggleOption[] = [
    { id: 'compact', label: 'compact view', active: !showCompactView },
    { id: 'card', label: 'card view', active: showCompactView },
  ];
  const groupedTools = useMemo(() => groupToolsByLabel(tools), [tools]);
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [toolsData, agentsData] = await Promise.all([
          toolsService.getAll(),
          agentsService.getAll(),
        ]);
        setTools(toolsData);
        setAgents(agentsData);
      } catch (error) {
        console.error('Failed to load data:', error);
        toast.error('Failed to Load Data', {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [namespace]);

  const toolUsageMap = useMemo(() => {
    const usageMap: Record<string, { inUse: boolean; agents: Agent[] }> = {};
    tools.forEach(tool => {
      usageMap[tool.name] = { inUse: false, agents: [] };
    });
    agents.forEach(agent => {
      agent.tools?.forEach((tool: AgentTool) => {
        if (tool.name && usageMap[tool.name]) {
          usageMap[tool.name].inUse = true;
          usageMap[tool.name].agents.push(agent);
        }
      });
    });
    return usageMap;
  }, [tools, agents]);

  const handleDelete = async (identifier: string) => {
    if (toolUsageMap[identifier]?.inUse) {
      return;
    }
    try {
      await toolsService.delete(identifier);
      setTools(tools.filter(tool => (tool.name || tool.type) !== identifier));
      toast.success('Tool Deleted', {
        description: 'Successfully deleted tool',
      });
    } catch (error) {
      console.error('Failed to delete tool:', error);
      toast.error('Failed to Delete Tool', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  };

  const handleInfo = (tool: Tool) => {
    setSelectedTool(tool);
    router.push(`/tool/${tool.name}`);
  };

  const handleSaveTool = async (toolSpec: {
    name: string;
    type: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    annotations?: Record<string, string>;
    url?: string;
  }) => {
    try {
      await toolsService.create({ ...toolSpec, namespace });
      toast.success('Tool Created', {
        description: `Successfully created ${toolSpec.name}`,
      });

      const updatedTools = await toolsService.getAll();
      setTools(updatedTools);
    } catch (error) {
      toast.error('Failed to Create Tool', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  };
  const parseAnnotations = (
    annotations: unknown,
  ): Record<string, unknown> | null => {
    try {
      if (!annotations) return null;
      let parsed: Record<string, unknown> = annotations as Record<
        string,
        unknown
      >;
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      return parsed;
    } catch {
      return null;
    }
  };
  const extractDescriptionFromAnnotations = (
    annotations: unknown,
  ): string | null => {
    const parsed = parseAnnotations(annotations);
    if (!parsed) return null;
    const lastApplied =
      parsed['kubectl.kubernetes.io/last-applied-configuration'];
    if (!lastApplied) return null;
    try {
      const config =
        typeof lastApplied === 'string' ? JSON.parse(lastApplied) : lastApplied;
      return config?.spec?.tool?.description ?? null;
    } catch {
      return null;
    }
  };
  const getAdditionalFields = (tool: Tool) => {
    const fields = [];
    if (tool.description) {
      fields.push({
        key: 'description',
        value: tool.description,
        label: 'Description',
      });
      return fields;
    }
    const desc = extractDescriptionFromAnnotations(tool.annotations);
    if (desc) {
      fields.push({
        key: 'description',
        value: desc,
        label: 'Description',
      });
    }
    return fields;
  };

  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="py-8 text-center">Loading...</div>
      </div>
    );
  }

  if (groupedTools.length === 0 && !loading) {
    return (
      <>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DASHBOARD_SECTIONS.tools.icon />
            </EmptyMedia>
            <EmptyTitle>No Tools Yet</EmptyTitle>
            <EmptyDescription>
              You haven&apos;t added any tools yet. Get started by adding your
              first tool.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setToolEditorOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Tool
            </Button>
          </EmptyContent>
          <Button
            variant="link"
            asChild
            className="text-muted-foreground"
            size="sm">
            <a
              href="https://mckinsey.github.io/agents-at-scale-ark/user-guide/tools/"
              target="_blank">
              Learn More <ArrowUpRightIcon />
            </a>
          </Button>
        </Empty>
        <ToolEditor
          open={toolEditorOpen}
          onOpenChange={setToolEditorOpen}
          onSave={handleSaveTool}
          namespace={namespace}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-end px-6 py-3">
          <ToggleSwitch
            options={viewOptions}
            onChange={id => setShowCompactView(id === 'card')}
          />
        </div>
        <main className="flex-1 overflow-auto p-6">
          <div className="flex flex-col gap-y-4">
            {groupedTools?.map((toolGroup, index) => (
              <Collapsible
                defaultOpen
                className="group/collapsible"
                key={`${toolGroup.groupName}-${index}`}>
                <div className="bg-card text-card-foreground flex flex-col rounded-xl border p-4">
                  <CollapsibleTrigger className="w-full py-4">
                    <div className="flex w-full flex-row items-center justify-between">
                      <Label className="text-lg font-bold">
                        {toolGroup.groupName}
                      </Label>
                      <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {showCompactView ? (
                      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {toolGroup.tools.map(tool => {
                          const toolData = toolUsageMap[tool.name] || {
                            inUse: false,
                            agents: [],
                          };
                          const agentNames = toolData.agents
                            .map(agent => agent.name)
                            .join(', ');
                          return (
                            <ToolCard
                              key={tool.id}
                              tool={tool}
                              onDelete={handleDelete}
                              onInfo={handleInfo}
                              deleteDisabled={toolData.inUse}
                              deleteDisabledReason={
                                toolData.inUse
                                  ? `Used by: ${agentNames}`
                                  : undefined
                              }
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {toolGroup.tools.map(tool => {
                          const toolData = toolUsageMap[tool.name] || {
                            inUse: false,
                            agents: [],
                          };
                          const agentNames = toolData.agents
                            .map(agent => agent.name)
                            .join(', ');
                          return (
                            <ToolRow
                              key={tool.id}
                              tool={tool}
                              onDelete={handleDelete}
                              onInfo={handleInfo}
                              namespace={namespace}
                              inUse={toolData.inUse}
                              inUseReason={
                                toolData.inUse
                                  ? `Used by: ${agentNames}`
                                  : undefined
                              }
                            />
                          );
                        })}
                      </div>
                    )}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        </main>
        {selectedTool && (
          <InfoDialog
            open={infoDialogOpen}
            onOpenChange={setInfoDialogOpen}
            title={`Tool: ${
              selectedTool.name || selectedTool.type || 'Unnamed'
            }`}
            data={selectedTool}
            additionalFields={getAdditionalFields(selectedTool)}
          />
        )}
      </div>
      <ToolEditor
        open={toolEditorOpen}
        onOpenChange={setToolEditorOpen}
        onSave={handleSaveTool}
        namespace={namespace}
      />
    </>
  );
});
