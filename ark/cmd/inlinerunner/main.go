/* Copyright 2025. McKinsey & Company */

// Command inlinerunner serves one inline Tool's script over MCP. It is the
// shared binary in every per-language runner image; the language decides only
// which interpreter it dispatches to.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"mckinsey.com/ark/internal/inlinetools/runner"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	cfg, err := runner.ConfigFromEnv()
	if err != nil {
		return err
	}

	// A revision mismatch is fatal rather than degraded: the pod must not
	// become ready, and there is nothing to re-read because the snapshot mount
	// is fixed for the pod's lifetime.
	script, err := runner.Load(cfg)
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           runner.Handler(cfg, script),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		<-ctx.Done()
		// A call in flight gets the execution budget to finish; the signal that
		// started this shutdown must not cancel it.
		shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), runner.ExecutionTimeout)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	log.Printf("inline runner serving tool %q (%s) on %s", cfg.ToolName, cfg.Language, cfg.Addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
