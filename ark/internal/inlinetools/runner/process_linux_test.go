/* Copyright 2025. McKinsey & Company */

package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"syscall"
	"testing"
	"time"
	"unsafe"

	"golang.org/x/sys/unix"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestContainmentSetupFailsClosed(t *testing.T) {
	if os.Getenv("ARK_TEST_DENY_SECCOMP") != "1" {
		executable, err := os.Executable()
		require.NoError(t, err)
		cmd := exec.Command(executable, "-test.run=^TestContainmentSetupFailsClosed$")
		cmd.Env = append(os.Environ(), "ARK_TEST_DENY_SECCOMP=1")
		output, err := cmd.CombinedOutput()
		require.NoError(t, err, string(output))
		return
	}
	runtime.LockOSThread()
	// This disposable test process simulates a runtime that rejects the
	// helper's PR_SET_NO_NEW_PRIVS / PR_SET_SECCOMP calls.
	filter := []unix.SockFilter{
		{Code: unix.BPF_LD | unix.BPF_W | unix.BPF_ABS, K: 0},
		{Code: unix.BPF_JMP | unix.BPF_JEQ | unix.BPF_K, K: unix.SYS_PRCTL, Jt: 1},
		{Code: unix.BPF_RET | unix.BPF_K, K: unix.SECCOMP_RET_ALLOW},
		{Code: unix.BPF_RET | unix.BPF_K, K: unix.SECCOMP_RET_ERRNO | uint32(unix.EPERM)},
	}
	require.NoError(t, unix.Prctl(unix.PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0))
	program := unix.SockFprog{Len: uint16(len(filter)), Filter: &filter[0]}
	_, _, errno := syscall.Syscall6(unix.SYS_PRCTL, unix.PR_SET_SECCOMP, unix.SECCOMP_MODE_FILTER, uintptr(unsafe.Pointer(&program)), 0, 0, 0)
	runtime.KeepAlive(filter)
	require.Zero(t, errno)
	marker := filepath.Join(t.TempDir(), "ran")
	result := script(t, fmt.Sprintf("touch %q", marker)).Call(context.Background(), nil)
	assert.True(t, result.IsError, result.Text)
	assert.Contains(t, result.Text, "failed to contain script")
	assert.NoFileExists(t, marker)
}

func TestInterpreterProcessRestriction(t *testing.T) {
	sources := map[string]string{
		"bash": `value=$(printf ok | tr a-z a-z); sleep 0.01 & wait; printf '%s' "$value"`,
		"python": `import errno, subprocess, sys
subprocess.run([sys.executable, "-c", "print('ok', end='')"], check=True)
try:
    subprocess.run([sys.executable, "-c", "pass"], start_new_session=True, check=True)
except OSError as error:
    assert error.errno == errno.EPERM
else:
    raise AssertionError("detached spawn was allowed")
`,
		"node": `const {spawnSync} = require('node:child_process');
const normal = spawnSync(process.execPath, ['-e', 'process.stdout.write("ok")']);
if (normal.status !== 0) throw new Error('normal subprocess failed');
const group = () => require('node:fs').readFileSync('/proc/self/stat', 'utf8').split(') ').pop().split(' ')[2];
const detached = spawnSync(process.execPath, ['-e', 'process.stdout.write((' + group + ')())'], {detached: true});
if (detached.error) {
    if (detached.error.code !== 'EPERM') throw detached.error;
} else if (detached.status !== 0 || detached.stdout.toString() !== group()) {
    throw new Error('detached child escaped the call process group');
}
process.stdout.write(normal.stdout);
`,
	}
	sources["ts"] = "const typed: string = 'ok';\n" + sources["node"]
	for language, source := range sources {
		t.Run(language, func(t *testing.T) {
			interpreter, err := Interpreter(language)
			if err != nil {
				t.Skip(err)
			}
			filename, err := SourceFilename(language)
			require.NoError(t, err)
			path := filepath.Join(t.TempDir(), filepath.Base(filename))
			require.NoError(t, os.WriteFile(path, []byte(source), 0o600))
			result := (Script{Interpreter: interpreter, Path: path}).Call(context.Background(), nil)
			require.False(t, result.IsError, result.Text)
			assert.Equal(t, "ok", result.Text)
		})
	}
}

type processFixture struct {
	Dir       string
	Operation string
	End       string
	Close     bool
	Child     bool
}

func TestDescendantsCannotEscapeCleanup(t *testing.T) {
	for _, operation := range []string{"setsid", "setpgid"} {
		for _, end := range []string{"exit", "timeout", "cancel"} {
			for _, closePipes := range []bool{false, true} {
				t.Run(fmt.Sprintf("%s/%s/closed-pipes=%t", operation, end, closePipes), func(t *testing.T) {
					checkDescendantCleanup(t, processFixture{Dir: t.TempDir(), Operation: operation, End: end, Close: closePipes})
				})
			}
		}
	}
}

func checkDescendantCleanup(t *testing.T, fixture processFixture) {
	t.Helper()
	executable, err := os.Executable()
	require.NoError(t, err)
	argument, err := json.Marshal(fixture)
	require.NoError(t, err)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	// Bound and clean up the fixture even when testing a broken implementation.
	defer func() {
		pid, _ := os.ReadFile(filepath.Join(fixture.Dir, "pid"))
		if n, err := strconv.Atoi(string(pid)); err == nil {
			_ = syscall.Kill(n, syscall.SIGKILL)
		}
	}()
	s := Script{Interpreter: executable, Path: "-test.run=^TestProcessFixture$", Timeout: 3 * time.Second}
	done := make(chan Result, 1)
	go func() { done <- s.Call(ctx, argument) }()
	ready := filepath.Join(fixture.Dir, "ready")
	require.Eventually(t, func() bool { _, err := os.Stat(ready); return err == nil }, 2*time.Second, 10*time.Millisecond)
	if fixture.End == "cancel" {
		cancel()
	}
	var result Result
	select {
	case result = <-done:
	case <-time.After(6 * time.Second):
		t.Fatal("call did not finish")
	}
	switch fixture.End {
	case "exit":
		assert.False(t, result.IsError, result.Text)
	case "cancel":
		assert.True(t, result.IsError, result.Text)
		assert.Contains(t, result.Text, "cancelled")
	case "timeout":
		assert.True(t, result.IsError, result.Text)
		assert.Contains(t, result.Text, "execution limit")
	}
	status, err := os.ReadFile(ready)
	require.NoError(t, err)
	assert.Equal(t, syscall.EPERM.Error(), string(status), "changing process group/session must be denied")
	time.Sleep(100 * time.Millisecond)
	marker := filepath.Join(fixture.Dir, "marker")
	require.NoError(t, os.Remove(marker))
	assert.Never(t, func() bool { _, err := os.Stat(marker); return err == nil }, 200*time.Millisecond, 10*time.Millisecond, "descendant survived the call")
}

func TestProcessFixture(t *testing.T) {
	var fixture processFixture
	if json.Unmarshal([]byte(os.Args[len(os.Args)-1]), &fixture) != nil || fixture.Dir == "" {
		return
	}
	if fixture.Child {
		var err error
		if fixture.Operation == "setsid" {
			_, err = syscall.Setsid()
		} else {
			err = syscall.Setpgid(0, 0)
		}
		status := "escaped"
		if err != nil {
			status = err.Error()
		}
		require.NoError(t, os.WriteFile(filepath.Join(fixture.Dir, "marker"), nil, 0o600))
		require.NoError(t, os.WriteFile(filepath.Join(fixture.Dir, "ready"), []byte(status), 0o600))
		deadline := time.Now().Add(10 * time.Second)
		for time.Now().Before(deadline) {
			_ = os.WriteFile(filepath.Join(fixture.Dir, "marker"), nil, 0o600)
			time.Sleep(20 * time.Millisecond)
		}
		os.Exit(0)
	}
	fixture.Child = true
	argument, err := json.Marshal(fixture)
	require.NoError(t, err)
	cmd := exec.Command(os.Args[0], "-test.run=^TestProcessFixture$", string(argument))
	if !fixture.Close {
		cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	}
	require.NoError(t, cmd.Start())
	require.NoError(t, os.WriteFile(filepath.Join(fixture.Dir, "pid"), []byte(strconv.Itoa(cmd.Process.Pid)), 0o600))
	for range 200 {
		if _, err := os.Stat(filepath.Join(fixture.Dir, "ready")); err == nil {
			if fixture.End == "exit" {
				os.Exit(0)
			}
			time.Sleep(10 * time.Second)
			os.Exit(0)
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("child did not become ready")
}
