/* Copyright 2025. McKinsey & Company */

package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// shell is the interpreter the tests dispatch to. The production dispatch table
// is tested separately; execution behaviour is language independent.
const shell = "/bin/sh"

func script(t *testing.T, body string) Script {
	t.Helper()
	path := filepath.Join(t.TempDir(), "source.sh")
	require.NoError(t, os.WriteFile(path, []byte(body), 0o600))
	return Script{Interpreter: shell, Path: path}
}

func TestArgumentsArePassedAsData(t *testing.T) {
	s := script(t, `printf '%s' "$1"`)

	cases := map[string]string{
		"metacharacters": `{"v":"$(touch /tmp/pwned); rm -rf / | echo 'x' & ` + "`id`" + `"}`,
		"unicode":        `{"v":"héllo 世界 🙂"}`,
		"nested":         `{"outer":{"inner":[1,2,{"deep":"value"}]},"n":null,"b":true}`,
		"quotes":         `{"v":"he said \"hi\" and 'bye'\nnewline\ttab"}`,
	}
	for name, arguments := range cases {
		t.Run(name, func(t *testing.T) {
			result := s.Call(context.Background(), json.RawMessage(arguments))
			require.False(t, result.IsError, result.Text)

			var got, want map[string]any
			require.NoError(t, json.Unmarshal([]byte(result.Text), &got))
			require.NoError(t, json.Unmarshal([]byte(arguments), &want))
			assert.Equal(t, want, got)
		})
	}
}

func TestShebangDoesNotChangeDispatch(t *testing.T) {
	// The script claims another interpreter; dispatch ignores it, so this runs
	// under the shell the Script names and the shebang is just a comment.
	s := script(t, "#!/usr/bin/python3\nprintf 'ran under sh'\n")

	result := s.Call(context.Background(), nil)

	require.False(t, result.IsError, result.Text)
	assert.Equal(t, "ran under sh", result.Text)
}

func TestInvalidArgumentsFailBeforeSpawn(t *testing.T) {
	// A missing interpreter proves nothing was spawned: a rejected argument
	// reports the argument, not a failure to start.
	s := Script{Interpreter: "/nonexistent/interpreter", Path: "/nonexistent/source.sh"}

	cases := map[string]json.RawMessage{
		"malformed":  json.RawMessage(`{"v":`),
		"non-object": json.RawMessage(`["a","b"]`),
		"string":     json.RawMessage(`"just a string"`),
		"number":     json.RawMessage(`7`),
	}
	for name, arguments := range cases {
		t.Run(name, func(t *testing.T) {
			result := s.Call(context.Background(), arguments)

			require.True(t, result.IsError)
			assert.Contains(t, result.Text, "invalid arguments")
			assert.NotContains(t, result.Text, "failed to start")
		})
	}

	t.Run("oversized", func(t *testing.T) {
		arguments := fmt.Appendf(nil, `{"v":%q}`, strings.Repeat("x", MaxArgumentBytes))

		result := s.Call(context.Background(), arguments)

		require.True(t, result.IsError)
		assert.Contains(t, result.Text, "exceeding the 65536 byte limit")
	})

	t.Run("at the limit", func(t *testing.T) {
		filler := strings.Repeat("x", MaxArgumentBytes-len(`{"v":""}`))
		arguments := fmt.Appendf(nil, `{"v":%q}`, filler)
		require.Len(t, arguments, MaxArgumentBytes)

		result := script(t, `printf '%s' "$1" | wc -c`).Call(context.Background(), arguments)

		require.False(t, result.IsError, result.Text)
		assert.Equal(t, fmt.Sprint(MaxArgumentBytes), strings.TrimSpace(result.Text))
	})
}

func TestMissingArgumentsBecomeAnEmptyObject(t *testing.T) {
	s := script(t, `printf '%s' "$1"`)

	for _, arguments := range []json.RawMessage{nil, json.RawMessage(""), json.RawMessage("null"), json.RawMessage("  ")} {
		result := s.Call(context.Background(), arguments)

		require.False(t, result.IsError, result.Text)
		assert.Equal(t, "{}", result.Text)
	}
}

func TestStdoutIsBoundedAndIndicatesTruncation(t *testing.T) {
	// 5 MiB in 1 KiB lines: enough to prove the drain is incremental.
	s := script(t, `awk 'BEGIN{l=sprintf("%1023s","");gsub(/ /,"a",l);for(i=0;i<5120;i++)print l}'`)

	result := s.Call(context.Background(), nil)

	require.False(t, result.IsError, result.Text)
	assert.LessOrEqual(t, len(result.Text), MaxStdoutBytes)
	assert.True(t, utf8.ValidString(result.Text))
	assert.True(t, strings.HasSuffix(result.Text, truncationNotice), "expected a truncation notice")
}

func TestTruncationLandsOnACharacterBoundary(t *testing.T) {
	// Every rune is 3 bytes, so the limit falls inside one of them.
	out := &head{limit: 10}
	_, _ = out.Write([]byte(strings.Repeat("世", 8)))

	text := out.text()

	assert.True(t, utf8.ValidString(text), "truncated text must stay valid UTF-8")
	assert.Equal(t, strings.Repeat("世", 3)+truncationNotice, text)
}

func TestStderrKeepsTheTailAndStaysBounded(t *testing.T) {
	s := script(t, `awk 'BEGIN{l=sprintf("%1023s","");gsub(/ /,"e",l);for(i=0;i<512;i++)print l > "/dev/stderr"}'; printf 'LAST' >&2; exit 3`)

	result := s.Call(context.Background(), nil)

	require.True(t, result.IsError)
	assert.Contains(t, result.Text, "LAST")
	assert.LessOrEqual(t, len(result.Text), MaxStderrBytes+512)
}

func TestNonZeroExitIsAToolError(t *testing.T) {
	s := script(t, `printf 'partial output'; printf 'boom' >&2; exit 7`)

	result := s.Call(context.Background(), nil)

	require.True(t, result.IsError)
	assert.Contains(t, result.Text, "exit status 7")
	assert.Contains(t, result.Text, "stderr: boom")
}

func TestInvalidUTF8StdoutIsAToolError(t *testing.T) {
	s := script(t, `printf '\377\376'`)

	result := s.Call(context.Background(), nil)

	require.True(t, result.IsError)
	assert.Contains(t, result.Text, "not valid UTF-8")
}

func TestInvalidStderrBytesAreRenderedSafely(t *testing.T) {
	s := script(t, `printf '\377bad' >&2; exit 1`)

	result := s.Call(context.Background(), nil)

	require.True(t, result.IsError)
	assert.True(t, utf8.ValidString(result.Text))
	assert.Contains(t, result.Text, "bad")
}

func TestTimeoutKillsTheProcessGroup(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "orphan")
	// The child keeps re-creating the marker while it lives, so liveness is
	// tested by deleting the marker and seeing whether anything puts it back.
	// A timing window ("did it get killed before it wrote once?") would be
	// flaky on a loaded machine; this is not.
	s := script(t, fmt.Sprintf(`(while true; do touch %q; sleep 0.2; done) & sleep 60`, marker))
	s.Timeout = 300 * time.Millisecond

	start := time.Now()
	result := s.Call(context.Background(), nil)

	require.True(t, result.IsError)
	assert.Contains(t, result.Text, "execution limit")
	assert.Less(t, time.Since(start), 10*time.Second)

	require.FileExists(t, marker, "the child should have run at all")
	require.NoError(t, os.Remove(marker))
	time.Sleep(2 * time.Second)

	_, err := os.Stat(marker)
	assert.True(t, os.IsNotExist(err), "the orphaned child should have been killed with its group")
}

func TestCallerCancellationReportsCancelled(t *testing.T) {
	s := script(t, `sleep 60`)
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(100 * time.Millisecond)
		cancel()
	}()

	result := s.Call(ctx, nil)

	require.True(t, result.IsError)
	assert.Contains(t, result.Text, "cancelled")
}

func TestCallerDeadlineShortensTheExecutionLimit(t *testing.T) {
	s := script(t, `sleep 60`)
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	start := time.Now()
	result := s.Call(ctx, nil)

	require.True(t, result.IsError)
	assert.Less(t, time.Since(start), 5*time.Second)
}

func TestLingeringChildHoldingPipesDoesNotBlockForever(t *testing.T) {
	s := script(t, `sleep 30 & printf 'done'`)

	start := time.Now()
	result := s.Call(context.Background(), nil)

	require.False(t, result.IsError, result.Text)
	assert.Equal(t, "done", result.Text)
	assert.Less(t, time.Since(start), 20*time.Second)
}

func TestStartFailureIsAToolError(t *testing.T) {
	s := Script{Interpreter: "/nonexistent/interpreter", Path: "/tmp/source.sh"}

	result := s.Call(context.Background(), json.RawMessage(`{}`))

	require.True(t, result.IsError)
	assert.Contains(t, result.Text, "failed to start")
}

func TestInterpreterDispatch(t *testing.T) {
	for _, lang := range []string{
		arkv1alpha1.InlineLanguageBash,
		arkv1alpha1.InlineLanguagePython,
		arkv1alpha1.InlineLanguageNode,
		arkv1alpha1.InlineLanguageTypeScript,
	} {
		filename, err := SourceFilename(lang)
		require.NoError(t, err)
		assert.True(t, strings.HasPrefix(filename, SourceDir+"/"), filename)
	}

	_, err := SourceFilename("ruby")
	assert.ErrorContains(t, err, "unsupported inline language")

	_, err = Interpreter("ruby")
	assert.ErrorContains(t, err, "unsupported inline language")
}

func TestInterpreterMissingCandidates(t *testing.T) {
	original := languages[arkv1alpha1.InlineLanguagePython]
	t.Cleanup(func() { languages[arkv1alpha1.InlineLanguagePython] = original })
	languages[arkv1alpha1.InlineLanguagePython] = language{
		filename: original.filename, candidates: []string{filepath.Join(t.TempDir(), "missing")},
	}

	interpreter, err := Interpreter(arkv1alpha1.InlineLanguagePython)

	assert.Empty(t, interpreter)
	assert.ErrorContains(t, err, "no python interpreter found")
}

func TestSourceFilenamesAreLanguageSpecific(t *testing.T) {
	expected := map[string]string{
		arkv1alpha1.InlineLanguageBash:       "/tool/source.sh",
		arkv1alpha1.InlineLanguagePython:     "/tool/source.py",
		arkv1alpha1.InlineLanguageNode:       "/tool/source.js",
		arkv1alpha1.InlineLanguageTypeScript: "/tool/source.ts",
	}
	for lang, want := range expected {
		got, err := SourceFilename(lang)
		require.NoError(t, err)
		assert.Equal(t, want, got)
	}
}
