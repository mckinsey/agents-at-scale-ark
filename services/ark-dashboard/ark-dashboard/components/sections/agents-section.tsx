"use client";

import type React from "react";
import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { toast } from "@/components/ui/use-toast";
import { AgentEditor } from "@/components/editors";
import {
  agentsService,
  teamsService,
  modelsService,
  type Agent,
  type AgentCreateRequest,
  type AgentUpdateRequest,
  type Team,
  type Model
} from "@/lib/services";
import { AgentCard } from "@/components/cards";
import { useDelayedLoading } from "@/lib/hooks";
import { AgentRow } from "@/components/rows/agent-row";
import { ToggleSwitch, type ToggleOption } from "@/components/ui/toggle-switch";

export const AgentsSection = forwardRef<
  { openAddEditor: () => void },
  object
>(function AgentsSection({}, ref) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [agentEditorOpen, setAgentEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const showLoading = useDelayedLoading(loading);
  const [showCompactView, setShowCompactView] = useState(false);

  const viewOptions: ToggleOption[] = [
    { id: "compact", label: "compact view", active: !showCompactView },
    { id: "card", label: "card view", active: showCompactView }
  ];

  useImperativeHandle(ref, () => ({
    openAddEditor: () => setAgentEditorOpen(true)
  }));

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [agentsData, teamsData, modelsData] = await Promise.all([
          agentsService.getAll(),
          teamsService.getAll(),
          modelsService.getAll()
        ]);
        setAgents(agentsData);
        setTeams(teamsData);
        setModels(modelsData);
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
  }, []);

  const handleSaveAgent = async (
    agent: (AgentCreateRequest | AgentUpdateRequest) & { id?: string }
  ) => {
    try {
      if (agent.id) {
        // This is an update
        const updateRequest = agent as AgentUpdateRequest & { id: string };
        await agentsService.updateById(
          updateRequest.id,
          updateRequest
        );
        toast({
          variant: "success",
          title: "Agent Updated",
          description: "Successfully updated the agent"
        });
      } else {
        // This is a create
        const createRequest = agent as AgentCreateRequest;
        await agentsService.create(createRequest);
        toast({
          variant: "success",
          title: "Agent Created",
          description: `Successfully created ${createRequest.name}`
        });
      }
      // Reload data
      const updatedAgents = await agentsService.getAll();
      setAgents(updatedAgents);
    } catch (error) {
      toast({
        variant: "destructive",
        title: agent.id ? "Failed to Update Agent" : "Failed to Create Agent",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
      });
    }
  };

  const handleDeleteAgent = async (id: string) => {
    try {
      const agent = agents.find((a) => a.id === id);
      if (!agent) {
        throw new Error("Agent not found");
      }
      await agentsService.deleteById(id);
      toast({
        variant: "success",
        title: "Agent Deleted",
        description: `Successfully deleted ${agent.name}`
      });
      // Reload data
      const updatedAgents = await agentsService.getAll();
      setAgents(updatedAgents);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to Delete Agent",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
      });
    }
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

        <main className="flex-1 overflow-auto px-6 py-0">
          {showCompactView && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 pb-6">
              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  teams={teams}
                  models={models}
                  onUpdate={handleSaveAgent}
                  onDelete={handleDeleteAgent}
                />
              ))}
            </div>
          )}

          {/* Stack view when there are many agents and not showing all */}
          {!showCompactView && (
            <div className="flex flex-col gap-3">
              {agents.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  teams={teams}
                  models={models}
                  onUpdate={handleSaveAgent}
                  onDelete={handleDeleteAgent}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <AgentEditor
        open={agentEditorOpen}
        onOpenChange={setAgentEditorOpen}
        agent={null}
        models={models}
        teams={teams}
        onSave={handleSaveAgent}
      />
    </>
  );
});
