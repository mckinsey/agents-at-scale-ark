/* Copyright 2025. McKinsey & Company */

package runner

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"sigs.k8s.io/yaml"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

const samplePath = "../../../../samples/tools/inline-tools.yaml"

// sampleScript runs the published sample source, so a sample that stops working
// fails here rather than in a user's cluster. It needs nothing but the
// interpreter: no file mount, no network, no third-party package.
func sampleScript(t *testing.T, toolName, interpreter, filename string) Script {
	t.Helper()

	path, err := exec.LookPath(interpreter)
	if err != nil {
		t.Skipf("no %s on this machine", interpreter)
	}

	raw, err := os.ReadFile(samplePath)
	require.NoError(t, err)

	for _, doc := range strings.Split(string(raw), "\n---\n") {
		var tool arkv1alpha1.Tool
		require.NoError(t, yaml.Unmarshal([]byte(doc), &tool))
		if tool.Kind != "Tool" || tool.Name != toolName || tool.Spec.Inline == nil {
			continue
		}
		source := filepath.Join(t.TempDir(), filename)
		require.NoError(t, os.WriteFile(source, []byte(tool.Spec.Inline.Source), 0o600))
		return Script{Interpreter: path, Path: source}
	}

	t.Fatalf("no inline Tool %q in %s", toolName, samplePath)
	return Script{}
}

func TestCSVSummariseSample(t *testing.T) {
	s := sampleScript(t, "csv-summarise", "python3", "source.py")

	cases := map[string]struct {
		arguments string
		want      string
		wantError string
	}{
		"valid":           {arguments: `{"csv":"amount\n2\n3\n"}`, want: `{"rows":2,"total":"5"}`},
		"header only":     {arguments: `{"csv":"amount\n"}`, want: `{"rows":0,"total":"0"}`},
		"empty":           {arguments: `{"csv":""}`, wantError: "must contain an amount column"},
		"wrong column":    {arguments: `{"csv":"total\n2\n"}`, wantError: "must contain an amount column"},
		"non-finite":      {arguments: `{"csv":"amount\nNaN\n"}`, wantError: "amount must be finite"},
		"not a string":    {arguments: `{"csv":5}`, wantError: "csv must be a string"},
		"decimal amounts": {arguments: `{"csv":"amount\n0.1\n0.2\n"}`, want: `{"rows":2,"total":"0.3"}`},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			result := s.Call(context.Background(), []byte(tc.arguments))

			if tc.wantError != "" {
				require.True(t, result.IsError, result.Text)
				assert.Contains(t, result.Text, tc.wantError)
				return
			}
			require.False(t, result.IsError, result.Text)
			assert.JSONEq(t, tc.want, result.Text)
		})
	}
}

func TestTextStatsSample(t *testing.T) {
	s := sampleScript(t, "text-stats", "bash", "source.sh")
	if _, err := exec.LookPath("jq"); err != nil {
		t.Skip("no jq on this machine")
	}

	result := s.Call(context.Background(), []byte(`{"text":"one\ntwo"}`))

	require.False(t, result.IsError, result.Text)
	assert.JSONEq(t, `{"lines":2,"characters":7}`, result.Text)
}
