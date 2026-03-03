package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func main() {
	engineURL := flag.String("engine-url", "http://localhost:9090", "URL of the execution engine to test")
	verbose := flag.Bool("v", false, "verbose test output")
	flag.Parse()

	conformanceDir := findConformanceDir()
	if conformanceDir == "" {
		fmt.Fprintln(os.Stderr, "error: cannot find tests/engine-conformance directory")
		os.Exit(1)
	}

	args := []string{"test"}
	if *verbose {
		args = append(args, "-v")
	}
	args = append(args, "-count=1", "-timeout=120s", "./...")

	cmd := exec.Command("go", args...)
	cmd.Dir = conformanceDir
	cmd.Env = append(os.Environ(), fmt.Sprintf("ENGINE_URL=%s", *engineURL))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	fmt.Printf("Running engine conformance tests against %s\n\n", *engineURL)
	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			os.Exit(exitErr.ExitCode())
		}
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("\nAll conformance tests passed.")
}

func findConformanceDir() string {
	candidates := []string{
		"tests/engine-conformance",
		"../../tests/engine-conformance",
	}

	exe, err := os.Executable()
	if err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "..", "..", "tests", "engine-conformance"))
	}

	for _, c := range candidates {
		abs, err := filepath.Abs(c)
		if err != nil {
			continue
		}
		if _, err := os.Stat(filepath.Join(abs, "conformance_test.go")); err == nil {
			return abs
		}
	}
	return ""
}
