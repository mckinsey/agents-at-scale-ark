/* Copyright 2025. McKinsey & Company */

// Command inlinerunner serves one inline Tool's script over MCP. It is the
// shared binary in every per-language runner image; the language decides only
// which interpreter it dispatches to.
package main

import (
	"context"
	"errors"
	"log"
	"net"
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

	listener, err := net.Listen("tcp", cfg.Addr)
	if err != nil {
		return err
	}

	log.Printf("inline runner serving tool %q (%s) on %s", cfg.ToolName, cfg.Language, cfg.Addr)
	return serve(ctx, server, listener, runner.ExecutionTimeout)
}

// serve runs srv until ctx is cancelled, then drains in-flight calls within
// grace. Serve returns ErrServerClosed as soon as Shutdown starts, so the
// drain has to be waited on separately: returning on ErrServerClosed alone
// would exit the process while a call still had budget left.
func serve(ctx context.Context, srv *http.Server, listener net.Listener, grace time.Duration) error {
	drained := make(chan error, 1)
	go func() {
		<-ctx.Done()
		// A call in flight gets the execution budget to finish; the signal that
		// started this shutdown must not cancel it.
		shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), grace)
		defer cancel()
		drained <- srv.Shutdown(shutdownCtx)
	}()

	if err := srv.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return <-drained
}
