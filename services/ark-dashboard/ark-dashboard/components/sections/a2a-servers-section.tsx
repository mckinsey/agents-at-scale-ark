"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { toast } from "@/components/ui/use-toast";
import { A2AServersService, type A2AServer } from "@/lib/services";
import { A2AServerCard } from "@/components/cards";
import { A2AServerRow } from "@/components/rows/a2a-server-row";
import { useDelayedLoading } from "@/lib/hooks";
import { InfoDialog } from "@/components/dialogs/info-dialog";
import { ToggleSwitch, type ToggleOption } from "@/components/ui/toggle-switch";

interface A2AServersSectionProps {
  namespace: string;
}

export const A2AServersSection: React.FC<A2AServersSectionProps> = ({
  namespace
}) => {
  const [a2aServers, setA2AServers] = useState<A2AServer[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoading = useDelayedLoading(loading);
  const [selectedServer, setSelectedServer] = useState<A2AServer | null>(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [showCompactView, setShowCompactView] = useState(false);

  const viewOptions: ToggleOption[] = [
    { id: "compact", label: "compact view", active: !showCompactView },
    { id: "card", label: "card view", active: showCompactView }
  ];

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const data = await A2AServersService.getAll(namespace);
        setA2AServers(data);
      } catch (error) {
        console.error("Failed to load A2A servers:", error);
        toast({
          variant: "destructive",
          title: "Failed to Load A2A Servers",
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

  const handleInfo = (server: A2AServer) => {
    setSelectedServer(server);
    setInfoDialogOpen(true);
  };
  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center py-8">Loading...</div>
      </div>
    );
  }

  return (
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
            {a2aServers.map((server) => (
              <A2AServerCard
                key={server.name || server.id}
                a2aServer={server}
                onInfo={handleInfo}
                namespace={namespace}
              />
            ))}
          </div>
        )}

        {!showCompactView && (
          <div className="flex flex-col gap-3">
            {a2aServers.map((server) => (
              <A2AServerRow
                key={server.name || server.id}
                a2aServer={server}
                onInfo={handleInfo}
              />
            ))}
          </div>
        )}
      </main>

      {selectedServer && (
        <InfoDialog
          open={infoDialogOpen}
          onOpenChange={setInfoDialogOpen}
          title={`A2A Server: ${selectedServer.name || "Unnamed"}`}
          data={selectedServer}
        />
      )}
    </div>
  );
};
