/* Copyright 2025. McKinsey & Company */

package inlinetools

import (
	"crypto/sha256"
	"encoding/hex"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

const (
	LabelTool            = "ark.mckinsey.com/inline-tool"
	LabelToolUID         = "ark.mckinsey.com/inline-tool-uid"
	SourceHashAnnotation = "ark.mckinsey.com/inline-source-hash"
)

type ChildNames struct {
	Source string
	Runner string
}

func NamesFor(toolName string) ChildNames {
	return ChildNames{Source: childName(toolName, "-source"), Runner: childName(toolName, "-runner")}
}

// Keep the controller and activator on the same deterministic, length-safe names.
func childName(toolName, suffix string) string {
	const maxLen = 63
	if len(toolName)+len(suffix) <= maxLen {
		return toolName + suffix
	}
	sum := sha256.Sum256([]byte(toolName))
	digest := hex.EncodeToString(sum[:])[:8]
	keep := maxLen - len(suffix) - len(digest) - 1
	return toolName[:keep] + "-" + digest + suffix
}

func RunnerLabels(tool *arkv1alpha1.Tool) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":       "ark-inline-runner",
		"app.kubernetes.io/managed-by": "ark-controller",
		LabelTool:                      tool.Name[:min(len(tool.Name), 63)],
		LabelToolUID:                   string(tool.UID),
	}
}
