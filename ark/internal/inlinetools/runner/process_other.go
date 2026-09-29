//go:build !linux

/* Copyright 2025. McKinsey & Company */

package runner

import (
	"context"
	"os/exec"
)

// Non-Linux execution supports local development only. Production runner
// images use Linux, where the helper prevents process-group/session changes.
func scriptCommand(ctx context.Context, s Script, argument string) (*exec.Cmd, error) {
	return exec.CommandContext(ctx, s.Interpreter, s.Path, argument), nil
}
