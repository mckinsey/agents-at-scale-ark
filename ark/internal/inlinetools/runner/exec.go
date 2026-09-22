/* Copyright 2025. McKinsey & Company */

package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"
)

// Script is one inline Tool's execution contract: a fixed interpreter and a
// fixed script path, chosen by the controller, never by a caller.
type Script struct {
	Interpreter string
	Path        string
	// Timeout defaults to ExecutionTimeout. The caller's own deadline still wins
	// when it is shorter.
	Timeout time.Duration
}

// Result is what the MCP layer returns. Text is always valid UTF-8.
type Result struct {
	Text    string
	IsError bool
}

func errorResult(format string, args ...any) Result {
	return Result{Text: fmt.Sprintf(format, args...), IsError: true}
}

// childEnv is the whole environment a script gets. The runner's own
// configuration (tool identity, expected revision) stays out of it, and there
// is nothing to inherit from the pod that a script needs.
var childEnv = []string{
	"PATH=/usr/local/bin:/usr/bin:/bin",
	"HOME=/tmp",
	"LANG=C.UTF-8",
	"LC_ALL=C.UTF-8",
	"PYTHONIOENCODING=utf-8",
	"PYTHONDONTWRITEBYTECODE=1",
}

// Call runs the script with one JSON-object argument and returns one result.
//
// The arguments are passed as a single argv element. There is no shell, so
// quotes, newlines, and metacharacters in the JSON are data.
func (s Script) Call(ctx context.Context, arguments json.RawMessage) Result {
	argument, err := compactArgument(arguments)
	if err != nil {
		return errorResult("invalid arguments: %v", err)
	}

	timeout := s.Timeout
	if timeout <= 0 {
		timeout = ExecutionTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, s.Interpreter, s.Path, argument)
	cmd.Env = childEnv
	// Setpgid makes the child a group leader, so cancellation reaches whatever
	// it spawned rather than only the interpreter.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error { return killGroup(cmd) }
	cmd.WaitDelay = drainGrace

	// Bounded writers rather than StdoutPipe: exec then owns the copy loop and
	// Wait only returns once it has finished, so output already produced is
	// never dropped. Reading pipes ourselves raced with Wait closing them and
	// truncated a script's output on Linux.
	out := &head{limit: MaxStdoutBytes - len(truncationNotice)}
	errOut := &tail{limit: MaxStderrBytes}
	cmd.Stdout = out
	cmd.Stderr = errOut

	if err := cmd.Start(); err != nil {
		return errorResult("failed to start %s: %v", s.Interpreter, err)
	}

	// WaitDelay bounds the case where a lingering child still holds the output
	// pipes after the script itself exited.
	waitErr := cmd.Wait()
	// The group is killed even on a clean exit: a backgrounded child that
	// released the pipes would otherwise survive the call.
	_ = killGroup(cmd)

	switch {
	case errors.Is(ctx.Err(), context.DeadlineExceeded):
		return errorResult("script exceeded its %s execution limit%s", timeout, stderrSuffix(errOut))
	case ctx.Err() != nil:
		return errorResult("script was cancelled%s", stderrSuffix(errOut))
	}

	if waitErr != nil {
		if errors.Is(waitErr, exec.ErrWaitDelay) {
			// The script finished but something it started kept the pipes open.
			return finish(out, errOut)
		}
		return errorResult("script failed: %v%s", waitErr, stderrSuffix(errOut))
	}
	return finish(out, errOut)
}

func finish(out *head, errOut *tail) Result {
	text := out.text()
	if !utf8.ValidString(text) {
		return errorResult("script produced output that is not valid UTF-8; inline tools must print text%s", stderrSuffix(errOut))
	}
	return Result{Text: text}
}

func stderrSuffix(errOut *tail) string {
	captured := strings.TrimRight(safeText(errOut.bytes()), "\n")
	if captured == "" {
		return ""
	}
	return "\nstderr: " + captured
}

// safeText renders possibly-binary stderr without emitting invalid UTF-8.
func safeText(b []byte) string {
	return strings.ToValidUTF8(string(b), "\uFFFD")
}

// compactArgument validates that the arguments are a JSON object and returns
// their compact form. Everything is checked before a process is started: an
// oversized or malformed argument never reaches an interpreter.
func compactArgument(arguments json.RawMessage) (string, error) {
	if len(bytes.TrimSpace(arguments)) == 0 || string(bytes.TrimSpace(arguments)) == "null" {
		return "{}", nil
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(arguments, &object); err != nil {
		return "", fmt.Errorf("arguments must be a JSON object: %v", err)
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, arguments); err != nil {
		return "", fmt.Errorf("arguments must be a JSON object: %v", err)
	}
	if compact.Len() > MaxArgumentBytes {
		return "", fmt.Errorf("serialized arguments are %d bytes, exceeding the %d byte limit", compact.Len(), MaxArgumentBytes)
	}
	return compact.String(), nil
}

func killGroup(cmd *exec.Cmd) error {
	if cmd.Process == nil {
		return nil
	}
	// Setpgid gave the child its own group, keyed on its pid.
	return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
}

// head keeps the first limit bytes and remembers that it dropped the rest.
type head struct {
	limit     int
	buf       []byte
	truncated bool
}

func (h *head) Write(p []byte) (int, error) {
	if room := h.limit - len(h.buf); room > 0 {
		if len(p) <= room {
			h.buf = append(h.buf, p...)
			return len(p), nil
		}
		h.buf = append(h.buf, p[:room]...)
	}
	h.truncated = true
	return len(p), nil
}

// text trims a partial trailing rune so truncation lands on a character
// boundary, then appends the notice within the same overall budget.
func (h *head) text() string {
	if !h.truncated {
		return string(h.buf)
	}
	return string(trimPartialTail(h.buf)) + truncationNotice
}

// tail keeps the last limit bytes.
type tail struct {
	limit int
	buf   []byte
	full  bool
}

func (t *tail) Write(p []byte) (int, error) {
	if len(p) >= t.limit {
		t.buf = append(t.buf[:0], p[len(p)-t.limit:]...)
		t.full = true
		return len(p), nil
	}
	if overflow := len(t.buf) + len(p) - t.limit; overflow > 0 {
		t.buf = t.buf[:copy(t.buf, t.buf[overflow:])]
		t.full = true
	}
	t.buf = append(t.buf, p...)
	return len(p), nil
}

// bytes drops a leading partial rune when the window has wrapped.
func (t *tail) bytes() []byte {
	if !t.full {
		return t.buf
	}
	return trimPartialHead(t.buf)
}

// trimPartialTail and trimPartialHead drop an incomplete rune at a cut edge.
// Both are bounded by UTFMax: bytes that are invalid for any other reason stay,
// so genuinely binary output is still reported as an error rather than silently
// cleaned up.
func trimPartialTail(b []byte) []byte {
	for range utf8.UTFMax {
		if len(b) == 0 {
			return b
		}
		if r, size := utf8.DecodeLastRune(b); r != utf8.RuneError || size > 1 {
			return b
		}
		b = b[:len(b)-1]
	}
	return b
}

func trimPartialHead(b []byte) []byte {
	for range utf8.UTFMax {
		if len(b) == 0 {
			return b
		}
		if r, size := utf8.DecodeRune(b); r != utf8.RuneError || size > 1 {
			return b
		}
		b = b[1:]
	}
	return b
}
