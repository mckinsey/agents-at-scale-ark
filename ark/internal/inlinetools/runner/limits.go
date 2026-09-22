/* Copyright 2025. McKinsey & Company */

// Package runner executes one inline Tool script inside its own pod. The
// limits here are the v1 contract, not tunables: an author who needs more than
// this needs an MCPServer.
package runner

import "time"

const (
	// MaxRequestBytes bounds an MCP request body before it is decoded.
	MaxRequestBytes = 128 << 10
	// MaxArgumentBytes bounds the serialized JSON argument handed to the script.
	MaxArgumentBytes = 64 << 10
	// MaxStdoutBytes bounds the returned text, including the truncation notice.
	MaxStdoutBytes = 256 << 10
	// MaxStderrBytes is how much trailing stderr an error may carry.
	MaxStderrBytes = 4 << 10

	// ExecutionTimeout is the ceiling for one script run. The caller's remaining
	// deadline shortens it; it never lengthens it.
	ExecutionTimeout = 30 * time.Second

	// drainGrace is how long Wait tolerates open output pipes after the script
	// exits. A child that inherited stdout and outlived its parent would
	// otherwise hold the call open indefinitely.
	drainGrace = 2 * time.Second
)

const truncationNotice = "\n[output truncated]"
