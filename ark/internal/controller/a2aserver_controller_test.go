/* Copyright 2025. McKinsey & Company */

package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/genai"
	"trpc.group/trpc-go/trpc-a2a-go/server"
)

func TestExtractSupportedExtensionsFromAgentCard(t *testing.T) {
	card := &genai.A2AAgentCard{
		Capabilities: server.AgentCapabilities{
			Extensions: []server.AgentExtension{
				{URI: "https://ark.mckinsey.com/extensions/history/v1"},
				{URI: "https://ark.mckinsey.com/extensions/permissions/v1"},
			},
		},
	}
	result := extractSupportedExtensions(card)
	assert.Equal(t, `["https://ark.mckinsey.com/extensions/history/v1","https://ark.mckinsey.com/extensions/permissions/v1"]`, result)
}

func TestExtractSupportedExtensionsDeduplicates(t *testing.T) {
	card := &genai.A2AAgentCard{
		Capabilities: server.AgentCapabilities{
			Extensions: []server.AgentExtension{
				{URI: "https://example.com/ext/a"},
				{URI: "https://example.com/ext/b"},
				{URI: "https://example.com/ext/a"},
			},
		},
	}
	result := extractSupportedExtensions(card)
	assert.Equal(t, `["https://example.com/ext/a","https://example.com/ext/b"]`, result)
}

func TestExtractSupportedExtensionsSortsStably(t *testing.T) {
	card := &genai.A2AAgentCard{
		Capabilities: server.AgentCapabilities{
			Extensions: []server.AgentExtension{
				{URI: "https://z.example.com/ext"},
				{URI: "https://a.example.com/ext"},
				{URI: "https://m.example.com/ext"},
			},
		},
	}
	result := extractSupportedExtensions(card)
	assert.Equal(t, `["https://a.example.com/ext","https://m.example.com/ext","https://z.example.com/ext"]`, result)
}

func TestExtractSupportedExtensionsTrimsWhitespace(t *testing.T) {
	card := &genai.A2AAgentCard{
		Capabilities: server.AgentCapabilities{
			Extensions: []server.AgentExtension{
				{URI: "  https://example.com/ext/trimmed  "},
			},
		},
	}
	result := extractSupportedExtensions(card)
	assert.Equal(t, `["https://example.com/ext/trimmed"]`, result)
}

func TestExtractSupportedExtensionsEmptyCapabilities(t *testing.T) {
	card := &genai.A2AAgentCard{
		Capabilities: server.AgentCapabilities{},
	}
	result := extractSupportedExtensions(card)
	assert.Equal(t, "", result)
}

func TestExtractSupportedExtensionsSkipsEmptyURIs(t *testing.T) {
	card := &genai.A2AAgentCard{
		Capabilities: server.AgentCapabilities{
			Extensions: []server.AgentExtension{
				{URI: ""},
				{URI: "   "},
				{URI: "https://example.com/ext/valid"},
			},
		},
	}
	result := extractSupportedExtensions(card)
	assert.Equal(t, `["https://example.com/ext/valid"]`, result)
}

func TestExtractSupportedExtensionsAllEmptyURIs(t *testing.T) {
	card := &genai.A2AAgentCard{
		Capabilities: server.AgentCapabilities{
			Extensions: []server.AgentExtension{
				{URI: ""},
				{URI: "  "},
			},
		},
	}
	result := extractSupportedExtensions(card)
	assert.Equal(t, "", result)
}

func TestA2AAgentChangedDetectsExtensionChanges(t *testing.T) {
	existing := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{
			Annotations: map[string]string{
				annotations.A2AServerName:         "server-1",
				annotations.A2AServerAddress:      "http://example.com",
				annotations.A2AServerSkills:       `[]`,
				annotations.A2AStreamingSupported: "false",
				annotations.A2ASupportedExtensions: `["https://ark.mckinsey.com/extensions/history/v1"]`,
			},
		},
		Spec: arkv1alpha1.AgentSpec{Description: "test"},
	}

	desired := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{
			Annotations: map[string]string{
				annotations.A2AServerName:         "server-1",
				annotations.A2AServerAddress:      "http://example.com",
				annotations.A2AServerSkills:       `[]`,
				annotations.A2AStreamingSupported: "false",
				annotations.A2ASupportedExtensions: `["https://ark.mckinsey.com/extensions/history/v1","https://ark.mckinsey.com/extensions/permissions/v1"]`,
			},
		},
		Spec: arkv1alpha1.AgentSpec{Description: "test"},
	}

	assert.True(t, a2aAgentChanged(existing, desired), "should detect extension annotation change")
}

func TestA2AAgentChangedDetectsExtensionRemoval(t *testing.T) {
	existing := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{
			Annotations: map[string]string{
				annotations.A2AServerName:          "server-1",
				annotations.A2AServerAddress:       "http://example.com",
				annotations.A2AServerSkills:        `[]`,
				annotations.A2AStreamingSupported:  "false",
				annotations.A2ASupportedExtensions: `["https://ark.mckinsey.com/extensions/history/v1"]`,
			},
		},
		Spec: arkv1alpha1.AgentSpec{Description: "test"},
	}

	desired := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{
			Annotations: map[string]string{
				annotations.A2AServerName:         "server-1",
				annotations.A2AServerAddress:      "http://example.com",
				annotations.A2AServerSkills:       `[]`,
				annotations.A2AStreamingSupported: "false",
			},
		},
		Spec: arkv1alpha1.AgentSpec{Description: "test"},
	}

	assert.True(t, a2aAgentChanged(existing, desired), "should detect extension annotation removal")
}

func TestA2AAgentChangedNoChange(t *testing.T) {
	ann := map[string]string{
		annotations.A2AServerName:          "server-1",
		annotations.A2AServerAddress:       "http://example.com",
		annotations.A2AServerSkills:        `[{"id":"s1","name":"skill"}]`,
		annotations.A2AStreamingSupported:  "true",
		annotations.A2ASupportedExtensions: `["https://ark.mckinsey.com/extensions/history/v1"]`,
	}
	existing := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Annotations: ann},
		Spec:       arkv1alpha1.AgentSpec{Description: "test", Prompt: "prompt"},
	}
	desired := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Annotations: ann},
		Spec:       arkv1alpha1.AgentSpec{Description: "test", Prompt: "prompt"},
	}

	assert.False(t, a2aAgentChanged(existing, desired))
}

func TestA2AAgentChangedDetectsDescriptionChange(t *testing.T) {
	ann := map[string]string{
		annotations.A2AServerName:         "server-1",
		annotations.A2AServerAddress:      "http://example.com",
		annotations.A2AServerSkills:       `[]`,
		annotations.A2AStreamingSupported: "false",
	}
	existing := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Annotations: ann},
		Spec:       arkv1alpha1.AgentSpec{Description: "old desc"},
	}
	desired := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Annotations: ann},
		Spec:       arkv1alpha1.AgentSpec{Description: "new desc"},
	}

	assert.True(t, a2aAgentChanged(existing, desired))
}

func TestBuildAgentWithSkillsDiscoveryOverridesInheritedExtensions(t *testing.T) {
	boolTrue := true
	a2aServer := &arkv1alpha1.Agent{}
	_ = a2aServer

	r := &A2AServerReconciler{}

	inheritedExtensions := `["https://example.com/manual-override"]`
	card := &genai.A2AAgentCard{
		Name:        "test-agent",
		Description: "test desc",
		Capabilities: server.AgentCapabilities{
			Streaming: &boolTrue,
			Extensions: []server.AgentExtension{
				{URI: "https://ark.mckinsey.com/extensions/history/v1"},
			},
		},
	}
	require.NotNil(t, r)
	require.NotNil(t, card)

	extensionsJSON := extractSupportedExtensions(card)
	assert.Equal(t, `["https://ark.mckinsey.com/extensions/history/v1"]`, extensionsJSON)
	assert.NotEqual(t, inheritedExtensions, extensionsJSON, "discovery should produce different value than manual override")
}
