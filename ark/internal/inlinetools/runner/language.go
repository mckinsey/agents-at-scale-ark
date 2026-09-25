/* Copyright 2025. McKinsey & Company */

package runner

import (
	"fmt"
	"os"
	"path/filepath"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// SourceDir is where the controller mounts the read-only source snapshot. It is
// a var only so tests can point at a temporary directory.
var SourceDir = "/tool"

// language is the fixed dispatch table. The interpreter comes from the language
// field alone: no shebang, no PATH lookup, and nothing a caller can influence.
// Candidates exist because the distroless bases name their interpreter
// differently between releases, not to let an image substitute one.
type language struct {
	filename   string
	candidates []string
}

var nodeCandidates = []string{"/nodejs/bin/node", "/usr/local/bin/node", "/usr/bin/node"}

var languages = map[string]language{
	arkv1alpha1.InlineLanguageBash: {
		filename:   "source.sh",
		candidates: []string{"/bin/bash", "/usr/bin/bash"},
	},
	arkv1alpha1.InlineLanguagePython: {
		filename: "source.py",
		candidates: []string{
			"/usr/bin/python3", "/usr/local/bin/python3",
			"/usr/bin/python3.13", "/usr/bin/python3.12", "/usr/bin/python3.11",
		},
	},
	arkv1alpha1.InlineLanguageNode: {
		filename:   "source.js",
		candidates: nodeCandidates,
	},
	// Node strips the types itself (built in since 22.18), so the TypeScript
	// image needs no vendored loader and no shell launcher.
	arkv1alpha1.InlineLanguageTypeScript: {
		filename:   "source.ts",
		candidates: nodeCandidates,
	},
}

// SourceFilename is the mount path for a language's source snapshot. The
// controller and the runner must agree on it, so both read it from here.
func SourceFilename(lang string) (string, error) {
	l, ok := languages[lang]
	if !ok {
		return "", fmt.Errorf("unsupported inline language %q", lang)
	}
	return filepath.Join(SourceDir, l.filename), nil
}

// Interpreter resolves the executable for a language in this image.
func Interpreter(lang string) (string, error) {
	l, ok := languages[lang]
	if !ok {
		return "", fmt.Errorf("unsupported inline language %q", lang)
	}
	for _, candidate := range l.candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("no %s interpreter found in this image (looked for %v)", lang, l.candidates)
}
