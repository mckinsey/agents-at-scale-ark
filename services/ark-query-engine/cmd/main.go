package main

import (
	"fmt"
	"log/slog"
	"os"

	"mckinsey.com/ark-query-engine/internal/engine"
	"trpc.group/trpc-go/trpc-a2a-go/server"
	"trpc.group/trpc-go/trpc-a2a-go/taskmanager"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	eng := engine.New()

	streaming := true
	tm, err := taskmanager.NewMemoryTaskManager(eng)
	if err != nil {
		slog.Error("failed to create task manager", "error", err)
		os.Exit(1)
	}

	card := server.AgentCard{
		Name:               "ark-query-engine",
		Description:        "Built-in Ark execution engine (OpenAI, Azure, Bedrock)",
		URL:                fmt.Sprintf("http://localhost:%s", port),
		Version:            "v1",
		DefaultInputModes:  []string{"text/plain"},
		DefaultOutputModes: []string{"text/plain"},
		Capabilities: server.AgentCapabilities{
			Streaming: &streaming,
		},
		Skills: []server.AgentSkill{},
	}

	a2aServer, err := server.NewA2AServer(card, tm)
	if err != nil {
		slog.Error("failed to create A2A server", "error", err)
		os.Exit(1)
	}

	addr := ":" + port
	slog.Info("starting ark-query-engine", "addr", addr)
	if err := a2aServer.Start(addr); err != nil {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}
