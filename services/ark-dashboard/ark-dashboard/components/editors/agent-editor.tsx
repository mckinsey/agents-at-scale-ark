"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  Agent,
  AgentTool,
  AgentCreateRequest,
  AgentUpdateRequest,
  Model,
  Team,
  Tool,
  Skill
} from "@/lib/services";
import { toolsService } from "@/lib/services";
import { getKubernetesNameError } from "@/lib/utils/kubernetes-validation";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "../ui/collapsible";
import { ChevronRight, CircleAlert, Trash2, Maximize2, Minimize2 } from "lucide-react";
import { groupToolsByLabel } from "@/lib/utils/groupToolsByLabels";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";

interface AgentEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: Agent | null;
  models: Model[];
  teams: Team[];
  onSave: (
    agent: (AgentCreateRequest | AgentUpdateRequest) & { id?: string }
  ) => void;
  namespace: string;
}

export function AgentEditor({
  open,
  onOpenChange,
  agent,
  models,
  onSave,
  namespace
}: Readonly<AgentEditorProps>) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedModelName, setSelectedModelName] =
    useState<string>("__none__");
  const [selectedModelNamespace, setSelectedModelNamespace] =
    useState<string>("");
  const [executionEngineName, setExecutionEngineName] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);

  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [selectedTools, setSelectedTools] = useState<AgentTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [unavailableTools, setUnavailableTools] = useState<Tool[]>([]);

  useEffect(() => {
    if (open) {
      const loadTools = async () => {
        setToolsLoading(true);
        try {
          const tools = await toolsService.getAll(namespace);
          const missingTools = agent?.tools?.filter(
            (agentTool) => !tools.some((t) => t.name === agentTool.name)
          ) as Tool[];
          setUnavailableTools(missingTools || []);
          setAvailableTools(tools);
        } catch (error) {
          console.error("Failed to load tools:", error);
          setAvailableTools([]);
          setUnavailableTools([]);
        } finally {
          setToolsLoading(false);
        }
      };
      loadTools();
    }
  }, [open, namespace, agent?.tools]);

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setDescription(agent.description || "");
      setSelectedModelName(agent.modelRef?.name || "__none__");
      setSelectedModelNamespace(agent.modelRef?.namespace || "");
      setExecutionEngineName(agent.executionEngine?.name || "");
      setPrompt(agent.prompt || "");
      setSelectedTools(agent.tools || []);
    } else {
      setName("");
      setDescription("");
      setSelectedModelName("__none__");
      setSelectedModelNamespace("");
      setExecutionEngineName("");
      setPrompt("");
      setSelectedTools([]);
      setIsPromptExpanded(false);
    }
  }, [agent, agent?.tools]);

  const handleSave = () => {
    if (agent) {
      // Update existing agent - don't include name in update request
      const updateData: AgentUpdateRequest & { id: string } = {
        description: description || undefined,
        // Only include model, execution engine, prompt, and tools for non-A2A agents
        modelRef:
          !agent.isA2A &&
          selectedModelName &&
          selectedModelName !== "" &&
          selectedModelName !== "__none__"
            ? {
                name: selectedModelName,
                namespace: selectedModelNamespace || undefined
              }
            : undefined,
        executionEngine:
          !agent.isA2A && executionEngineName
            ? {
                name: executionEngineName,
                namespace: namespace
              }
            : undefined,
        prompt: !agent.isA2A ? prompt || undefined : undefined,
        tools: agent.isA2A ? undefined : selectedTools,
        id: agent.id
      };
      onSave(updateData);
    } else {
      // Create new agent - assumes non-A2A since A2A agents are not created via this editor
      const createData: AgentCreateRequest = {
        name,
        description: description || undefined,
        modelRef:
          selectedModelName &&
          selectedModelName !== "" &&
          selectedModelName !== "__none__"
            ? {
                name: selectedModelName,
                namespace: selectedModelNamespace || undefined
              }
            : undefined,
        executionEngine: executionEngineName
          ? {
              name: executionEngineName,
              namespace: namespace
            }
          : undefined,
        prompt: prompt || undefined,
        tools: selectedTools
      };
      onSave(createData);
    }
    onOpenChange(false);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (value) {
      const error = getKubernetesNameError(value);
      setNameError(error);
    } else {
      setNameError(null);
    }
  };

  const handleToolToggle = (tool: Tool, checked: boolean) => {
    if (checked) {
      const newTool: AgentTool = {
        type: "custom",
        name: tool.name
      };
      setSelectedTools((prev) => [...prev, newTool]);
    } else {
      setSelectedTools((prev) => prev.filter((t) => t.name !== tool.name));
    }
  };

  const onDeleteClick = (tool: Tool) => {
    setUnavailableTools((prev) =>
      prev.filter((unavailableTool) => unavailableTool.name !== tool.name)
    );
    setSelectedTools((prev) => prev.filter((t) => t.name !== tool.name));
  };
  const isToolSelected = (toolName: string) => {
    return selectedTools.some((t) => t.name === toolName);
  };

  const isValid = name.trim() && !nameError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{agent ? "Edit Agent" : "Create New Agent"}</DialogTitle>
          <DialogDescription>
            {agent
              ? "Update the agent information below."
              : "Fill in the information for the new agent."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g., customer-support-agent"
              disabled={!!agent}
              className={nameError ? "border-red-500" : ""}
            />
            {nameError && (
              <p className="text-sm text-red-500 mt-1">{nameError}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Handles customer inquiries and support tickets"
            />
          </div>
          {!agent?.isA2A && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="model">Model</Label>
                <Select
                  value={selectedModelName}
                  onValueChange={setSelectedModelName}
                >
                  <SelectTrigger id="model">
                    <SelectValue placeholder="Select a model (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">
                        None (Unset)
                      </span>
                    </SelectItem>
                    {models.map((model) => (
                      <SelectItem key={model.name} value={model.name}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="execution-engine">Execution Engine</Label>
                <Input
                  id="execution-engine"
                  value={executionEngineName}
                  onChange={(e) => setExecutionEngineName(e.target.value)}
                  placeholder="e.g., langchain-executor"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="prompt">Prompt</Label>
                  <div className="flex items-center gap-2">
                    {prompt.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {prompt.length} characters
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                      className="h-8 px-2"
                    >
                      {isPromptExpanded ? (
                        <>
                          <Minimize2 className="h-4 w-4 mr-1" />
                          Collapse
                        </>
                      ) : (
                        <>
                          <Maximize2 className="h-4 w-4 mr-1" />
                          Expand
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <Textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter the agent's prompt or instructions..."
                  className={`transition-all duration-200 resize-none ${
                    isPromptExpanded 
                      ? "min-h-[400px] max-h-[500px] overflow-y-auto" 
                      : "min-h-[100px] max-h-[150px]"
                  }`}
                  style={{ 
                    whiteSpace: 'pre-wrap', 
                    wordWrap: 'break-word' 
                  }}
                />
                {isPromptExpanded && prompt.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {prompt.split('\n').length} lines
                  </div>
                )}
              </div>
            </>
          )}

          {agent?.isA2A ? (
            <SkillsDisplaySection skills={agent.skills || []} />
          ) : (
            <ToolSelectionSection
              availableTools={availableTools}
              toolsLoading={toolsLoading}
              onToolToggle={handleToolToggle}
              isToolSelected={isToolSelected}
              unavailableTools={unavailableTools}
              onDeleteClick={onDeleteClick}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="text-left" tabIndex={-1} asChild>
                <span className="inline-block">
                  <Button
                    onClick={handleSave}
                    disabled={!isValid || unavailableTools.length > 0}
                  >
                    {agent ? "Update" : "Create"}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {unavailableTools.length > 0
                    ? "Delete all unavailable tools to proceed"
                    : ""}{" "}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ToolItem = ({
  tool,
  isSelected,
  onToggle,
  isUnavailable,
  onDeleteClick
}: {
  tool: Tool;
  isSelected: boolean;
  onToggle: (tool: Tool, checked: boolean) => void;
  isUnavailable: boolean;
  onDeleteClick: (tool: Tool) => void;
}) => (
  <div className="flex flex-row justify-between" key={`tool-${tool.id}`}>
    <div className="flex items-start space-x-2 w-fit">
      {isUnavailable ? (
        <>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="text-left" tabIndex={-1}>
                <CircleAlert className="w-4 h-4 mt-1 text-red-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>This tool is unavailable in the system</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      ) : (
        <Checkbox
          id={`tool-${tool.id}`}
          checked={isSelected}
          onCheckedChange={(checked) => onToggle(tool, checked)}
          className="mt-1"
        />
      )}
      <Label
        htmlFor={`tool-${tool.id}`}
        className="text-sm font-normal cursor-pointer flex-1"
      >
        <div className="font-medium">{tool.name}</div>
        {tool.description && (
          <div className="text-xs text-muted-foreground">
            {tool.description}
          </div>
        )}
      </Label>
    </div>
    <div>
      {isUnavailable && (
        <Button
          variant={"ghost"}
          size="sm"
          className="h-8 w-8 p-0 hover:text-red-500"
          onClick={() => onDeleteClick(tool)}
          aria-label={"Delete tool"}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  </div>
);

const ToolGroup = ({
  toolGroup,
  onToggle,
  isToolSelected,
  unavailableTools,
  onDeleteClick
}: {
  toolGroup: { groupName: string; tools: Tool[] };
  onToggle: (tool: Tool, checked: boolean) => void;
  isToolSelected: (name: string) => boolean;
  unavailableTools: Tool[];
  onDeleteClick: (tool: Tool) => void;
}) => (
  <Collapsible
    defaultOpen
    className="group/collapsible"
    key={toolGroup.groupName}
  >
    <div className="bg-gray-100 p-2">
      <CollapsibleTrigger className="w-full">
        <div className="flex flex-row items-center justify-between w-full">
          <Label>{toolGroup.groupName}</Label>
          <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90 h-4 w-4" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex gap-y-2 flex-col pt-2">
          {toolGroup.tools?.map((tool) => (
            <ToolItem
              key={`tool-${tool.id ? tool.id : tool.name}`}
              tool={tool}
              isSelected={isToolSelected(tool.name)}
              onToggle={onToggle}
              isUnavailable={unavailableTools.some(
                (unavailableTool) => unavailableTool.name === tool.name
              )}
              onDeleteClick={onDeleteClick}
            />
          ))}
        </div>
      </CollapsibleContent>
    </div>
  </Collapsible>
);

interface ToolSelectionSectionProps {
  availableTools: Tool[];
  toolsLoading: boolean;
  onToolToggle: (tool: Tool, checked: boolean) => void;
  isToolSelected: (toolName: string) => boolean;
  unavailableTools: Tool[];
  onDeleteClick: (tool: Tool) => void;
}

function ToolSelectionSection({
  availableTools,
  toolsLoading,
  onToolToggle,
  isToolSelected,
  unavailableTools,
  onDeleteClick
}: Readonly<ToolSelectionSectionProps>) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTools = [...availableTools].filter(
    (tool) =>
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool?.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const groupedTools = useMemo(
    () => groupToolsByLabel(filteredTools),
    [filteredTools]
  );

  const renderGroupedTools = () => {
    return (
      <>
        <ToolGroup
          key={"unavailable-tools"}
          toolGroup={{
            groupName: "Unavailable Tools",
            tools: [...unavailableTools]
          }}
          onToggle={onToolToggle}
          isToolSelected={isToolSelected}
          unavailableTools={unavailableTools}
          onDeleteClick={onDeleteClick}
        />
        {groupedTools?.map((toolGroup, index) => (
          <ToolGroup
            key={`${toolGroup.groupName}-${index}`}
            toolGroup={toolGroup}
            onToggle={onToolToggle}
            isToolSelected={isToolSelected}
            unavailableTools={unavailableTools}
            onDeleteClick={onDeleteClick}
          />
        ))}
      </>
    );
  };

  const renderTools = () => {
    if (availableTools.length === 0 && unavailableTools.length === 0) {
      return (
        <div className="text-sm text-muted-foreground">
          No tools available in this namespace
        </div>
      );
    } else {
      return (
        <>
          <Input
            placeholder="Filter tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-sm"
          />
          <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
            {filteredTools.length === 0 && searchQuery ? (
              <div className="text-sm text-muted-foreground text-center py-2">
                {searchQuery
                  ? `No tools found matching "${searchQuery}"`
                  : "No tools available"}
              </div>
            ) : (
              renderGroupedTools()
            )}
          </div>
        </>
      );
    }
  };
  return (
    <div className="grid gap-2">
      <Label>Tools</Label>
      <div className="space-y-2">
        {toolsLoading ? (
          <div className="text-sm text-muted-foreground">Loading tools...</div>
        ) : (
          renderTools()
        )}
      </div>
    </div>
  );
}

interface SkillsDisplaySectionProps {
  skills: Skill[];
}

function SkillsDisplaySection({ skills }: Readonly<SkillsDisplaySectionProps>) {
  return (
    <div className="grid gap-2">
      <Label>Skills</Label>
      <div className="space-y-2">
        {skills.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No skills available for this agent
          </div>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
            {skills.map((skill, index) => (
              <div
                key={`${skill.id}-${index}`}
                className="space-y-1 p-2 border-l-2 border-blue-200 bg-blue-50 rounded"
              >
                <div className="font-medium text-sm">{skill.name}</div>
                {skill.description && (
                  <div className="text-xs text-muted-foreground">
                    {skill.description}
                  </div>
                )}
                {skill.tags && skill.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {skill.tags.map((tag, tagIndex) => (
                      <span
                        key={`${tag}-${tagIndex}`}
                        className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
