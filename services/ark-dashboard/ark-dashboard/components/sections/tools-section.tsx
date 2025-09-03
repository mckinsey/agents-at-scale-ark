"use client";

import type React from "react";
import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { toast } from "@/components/ui/use-toast";
import {
  toolsService,
  agentsService,
  type Tool,
  type Agent,
  type AgentTool
} from "@/lib/services";
import { ToolCard } from "@/components/cards";
import { ToolRow } from "@/components/rows/tool-row";
import { useDelayedLoading } from "@/lib/hooks";
import { ToggleSwitch, type ToggleOption } from "@/components/ui/toggle-switch";
import { InfoDialog } from "@/components/dialogs/info-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@radix-ui/react-collapsible";
import { Label } from "@radix-ui/react-label";
import { ChevronRight } from "lucide-react";
import { groupToolsByLabel } from "@/lib/utils/groupToolsByLabels";
import { useRouter } from "next/navigation";
import { ToolEditor } from "../editors/tool-editor";
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
    openAddEditor: () => setToolEditorOpen(true)
  }));

  const viewOptions: ToggleOption[] = [
    { id: "compact", label: "compact view", active: !showCompactView },
    { id: "card", label: "card view", active: showCompactView }
  ];
  const groupedTools = useMemo(() => groupToolsByLabel(tools), [tools]);
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [toolsData, agentsData] = await Promise.all([
          toolsService.getAll(namespace),
          agentsService.getAll(namespace)
        ]);
        setTools(toolsData);
        setAgents(agentsData);
      } catch (error) {
        console.error("Failed to load data:", error);
        toast({
          variant: "destructive",
          title: "Failed to Load Data",
          description:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred"
        });
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [namespace]);

  const toolUsageMap = useMemo(() => {
    const usageMap: Record<string, { inUse: boolean; agents: Agent[] }> = {};
    tools.forEach((tool) => {
      usageMap[tool.name] = { inUse: false, agents: [] };
    });
    agents.forEach((agent) => {
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
      await toolsService.delete(namespace, identifier);
      setTools(tools.filter((tool) => (tool.name || tool.type) !== identifier));
      toast({
        variant: "success",
        title: "Tool Deleted",
        description: "Successfully deleted tool"
      });
    } catch (error) {
      console.error("Failed to delete tool:", error);
      toast({
        variant: "destructive",
        title: "Failed to Delete Tool",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
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
      await toolsService.create(namespace, toolSpec);
      toast({
        variant: "success",
        title: "Tool Created",
        description: `Successfully created ${toolSpec.name}`
      });

      const updatedTools = await toolsService.getAll(namespace);
      setTools(updatedTools);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to Create Tool",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
      });
    }
  };
  const parseAnnotations = (
    annotations: unknown
  ): Record<string, unknown> | null => {
    try {
      if (!annotations) return null;
      let parsed: Record<string, unknown> = annotations as Record<
        string,
        unknown
      >;
      if (typeof parsed === "string") {
        parsed = JSON.parse(parsed);
      }
      return parsed;
    } catch {
      return null;
    }
  };
  const extractDescriptionFromAnnotations = (
    annotations: unknown
  ): string | null => {
    const parsed = parseAnnotations(annotations);
    if (!parsed) return null;
    const lastApplied =
      parsed["kubectl.kubernetes.io/last-applied-configuration"];
    if (!lastApplied) return null;
    try {
      const config =
        typeof lastApplied === "string" ? JSON.parse(lastApplied) : lastApplied;
      return config?.spec?.tool?.description ?? null;
    } catch {
      return null;
    }
  };
  const getAdditionalFields = (tool: Tool) => {
    const fields = [];
    if (tool.description) {
      fields.push({
        key: "description",
        value: tool.description,
        label: "Description"
      });
      return fields;
    }
    const desc = extractDescriptionFromAnnotations(tool.annotations);
    if (desc) {
      fields.push({
        key: "description",
        value: desc,
        label: "Description"
      });
    }
    return fields;
  };
  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center py-8">Loading...</div>
      </div>
    );
  }
  return (
    <>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-end px-6 py-3">
          <ToggleSwitch
            options={viewOptions}
            onChange={(id) => setShowCompactView(id === "card")}
          />
        </div>
        <main className="flex-1 overflow-auto p-6">
          <div className="flex flex-col gap-y-4">
            {groupedTools?.map((toolGroup, index) => (
              <Collapsible
                defaultOpen
                className="group/collapsible"
                key={`${toolGroup.groupName}-${index}`}
              >
                <div className="bg-card text-card-foreground flex flex-col rounded-xl border p-4 shadow-sm">
                  <CollapsibleTrigger className="w-full py-4">
                    <div className="flex flex-row items-center justify-between w-full">
                      <Label className="text-lg font-bold">
                        {toolGroup.groupName}
                      </Label>
                      <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90 h-4 w-4" />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {showCompactView ? (
                      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 pb-6">
                        {toolGroup.tools.map((tool) => {
                          const toolData = toolUsageMap[tool.name] || {
                            inUse: false,
                            agents: []
                          };
                          const agentNames = toolData.agents
                            .map((agent) => agent.name)
                            .join(", ");
                          return (
                            <ToolCard
                              key={tool.id}
                              tool={tool}
                              onDelete={handleDelete}
                              onInfo={handleInfo}
                              namespace={namespace}
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
                      <div className="flex flex-col gap-3 pb-6">
                        {toolGroup.tools.map((tool) => {
                          const toolData = toolUsageMap[tool.name] || {
                            inUse: false,
                            agents: []
                          };
                          const agentNames = toolData.agents
                            .map((agent) => agent.name)
                            .join(", ");
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
            title={`Tool: ${selectedTool.name || selectedTool.type || "Unnamed"}`}
            data={selectedTool}
            additionalFields={getAdditionalFields(selectedTool)}
          />
        )}
      </div>
      <ToolEditor
        open={toolEditorOpen}
        onOpenChange={setToolEditorOpen}
        onSave={handleSaveTool}
      />
    </>
  );
});