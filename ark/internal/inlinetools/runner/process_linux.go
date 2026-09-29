/* Copyright 2025. McKinsey & Company */

package runner

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"syscall"
	"unsafe"

	"golang.org/x/sys/unix"
)

const execHelper = "--ark-inline-exec"

// Re-exec gives each call a private thread/process for installing seccomp. The
// server must never install this filter on one of its own reusable Go threads.
func init() {
	if len(os.Args) != 5 || os.Args[1] != execHelper {
		return
	}
	runtime.LockOSThread()
	if err := restrictProcessGroup(); err != nil {
		fmt.Fprintln(os.Stderr, "failed to contain script:", err)
		os.Exit(126)
	}
	if err := syscall.Exec(os.Args[2], os.Args[2:], childEnv); err != nil {
		fmt.Fprintln(os.Stderr, "failed to start interpreter:", err)
		os.Exit(126)
	}
}

func scriptCommand(ctx context.Context, s Script, argument string) (*exec.Cmd, error) {
	executable, err := os.Executable()
	if err != nil {
		return nil, err
	}
	return exec.CommandContext(ctx, executable, execHelper, s.Interpreter, s.Path, argument), nil
}

// The helper already leads the call's process group. Denying both ways to
// leave it makes group cleanup cover descendants, including across fork/exec.
// This narrows process lifetime; it is not a hostile-code sandbox.
func restrictProcessGroup() error {
	var arch uint32
	switch runtime.GOARCH {
	case "amd64":
		arch = unix.AUDIT_ARCH_X86_64
	case "arm64":
		arch = unix.AUDIT_ARCH_AARCH64
	default:
		return fmt.Errorf("unsupported runner architecture %s", runtime.GOARCH)
	}
	filter := []unix.SockFilter{
		{Code: unix.BPF_LD | unix.BPF_W | unix.BPF_ABS, K: 4}, // seccomp_data.arch
		{Code: unix.BPF_JMP | unix.BPF_JEQ | unix.BPF_K, K: arch, Jt: 1},
		{Code: unix.BPF_RET | unix.BPF_K, K: unix.SECCOMP_RET_KILL_PROCESS},
		{Code: unix.BPF_LD | unix.BPF_W | unix.BPF_ABS, K: 0}, // seccomp_data.nr
		// x32 shares AUDIT_ARCH_X86_64 but uses different syscall numbers.
		{Code: unix.BPF_JMP | unix.BPF_JGE | unix.BPF_K, K: 0x40000000, Jf: 1},
		{Code: unix.BPF_RET | unix.BPF_K, K: unix.SECCOMP_RET_ERRNO | uint32(unix.EPERM)},
		{Code: unix.BPF_JMP | unix.BPF_JEQ | unix.BPF_K, K: unix.SYS_SETSID, Jt: 2},
		{Code: unix.BPF_JMP | unix.BPF_JEQ | unix.BPF_K, K: unix.SYS_SETPGID, Jt: 1},
		{Code: unix.BPF_RET | unix.BPF_K, K: unix.SECCOMP_RET_ALLOW},
		{Code: unix.BPF_RET | unix.BPF_K, K: unix.SECCOMP_RET_ERRNO | uint32(unix.EPERM)},
	}
	if err := unix.Prctl(unix.PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0); err != nil {
		return err
	}
	program := unix.SockFprog{Len: uint16(len(filter)), Filter: &filter[0]}
	_, _, errno := syscall.Syscall6(unix.SYS_PRCTL, unix.PR_SET_SECCOMP, unix.SECCOMP_MODE_FILTER, uintptr(unsafe.Pointer(&program)), 0, 0, 0)
	runtime.KeepAlive(filter)
	if errno != 0 {
		return errno
	}
	return nil
}
