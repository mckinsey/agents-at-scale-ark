package main

import (
	"flag"
	"fmt"
	"log/slog"
	"os"

	"trpc.group/trpc-go/trpc-a2a-go/server"
	"trpc.group/trpc-go/trpc-a2a-go/taskmanager"

	"example.com/my-execution-engine/internal/engine"
)

func main() {
	port := flag.Int("port", 9090, "server port")
	flag.Parse()

	eng := &engine.Engine{}
	streaming := true

	tm, err := taskmanager.NewMemoryTaskManager(eng)
	if err != nil {
		slog.Error("failed to create task manager", "error", err)
		os.Exit(1)
	}

	card := server.AgentCard{
		Name:               "my-execution-engine",
		Description:        "Custom Ark execution engine",
		URL:                fmt.Sprintf("http://localhost:%d", *port),
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

	addr := fmt.Sprintf(":%d", *port)
	slog.Info("starting engine", "addr", addr)
	if err := a2aServer.Start(addr); err != nil {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}
