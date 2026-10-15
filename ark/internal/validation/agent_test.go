//nolint:goconst
package validation

import (
	"context"
	"strings"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

func TestValidateAgent(t *testing.T) {
	v := NewValidator(newMockLookup())
	ctx := context.Background()

	tests := []struct {
		name        string
		spec        arkv1alpha1.AgentSpec
		expectErr   bool
		errContains string
	}{
		{name: "valid agent"},
		{
			name:      "rejects invalid parameter",
			spec:      arkv1alpha1.AgentSpec{Parameters: []arkv1alpha1.Parameter{{Name: ""}}},
			expectErr: true,
		},
		{
			name:      "rejects invalid override resourceType",
			spec:      arkv1alpha1.AgentSpec{Overrides: []arkv1alpha1.Override{{ResourceType: "invalid"}}},
			expectErr: true,
		},
		{
			name:      "rejects agent tool with unsupported type",
			spec:      arkv1alpha1.AgentSpec{Tools: []arkv1alpha1.AgentTool{{Type: "unknown", Name: "t"}}},
			expectErr: true,
		},
		{
			name:      "rejects built-in tool without name",
			spec:      arkv1alpha1.AgentSpec{Tools: []arkv1alpha1.AgentTool{{Type: "built-in"}}},
			expectErr: true,
		},
		{
			name:      "rejects invalid built-in tool name",
			spec:      arkv1alpha1.AgentSpec{Tools: []arkv1alpha1.AgentTool{{Type: "built-in", Name: "invalid"}}},
			expectErr: true,
		},
		{
			name: "accepts valid built-in tool",
			spec: arkv1alpha1.AgentSpec{Tools: []arkv1alpha1.AgentTool{{Type: "built-in", Name: "noop"}}},
		},
		{
			name: "accepts an inline tool attachment",
			spec: arkv1alpha1.AgentSpec{Tools: []arkv1alpha1.AgentTool{{Type: "inline", Name: "csv-summarise"}}},
		},
		{
			name:        "rejects inline tool without name",
			spec:        arkv1alpha1.AgentSpec{Tools: []arkv1alpha1.AgentTool{{Type: "inline"}}},
			expectErr:   true,
			errContains: "inline tools must specify a name",
		},
		{
			name:      "rejects mcp tool without name",
			spec:      arkv1alpha1.AgentSpec{Tools: []arkv1alpha1.AgentTool{{Type: "mcp"}}},
			expectErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			agent := &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
				Spec:       tt.spec,
			}
			_, err := v.ValidateAgent(ctx, agent)
			assertAgentValidationErr(t, err, tt.expectErr, tt.errContains)
		})
	}
}

func assertAgentValidationErr(t *testing.T, err error, expectErr bool, errContains string) {
	t.Helper()

	if !expectErr {
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		return
	}
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if errContains != "" && !strings.Contains(err.Error(), errContains) {
		t.Fatalf("expected error containing %q, got: %v", errContains, err)
	}
}

func TestValidateAgentMigrationWarnings(t *testing.T) {
	v := NewValidator(newMockLookup())
	ctx := context.Background()

	agent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "a",
			Namespace: "default",
			Annotations: map[string]string{
				annotations.MigrationWarningPrefix + "test": "warning message",
			},
		},
	}
	warnings, err := v.ValidateAgent(ctx, agent)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(warnings) != 1 {
		t.Fatalf("expected 1 warning, got %d", len(warnings))
	}
}

func TestValidateAgentModelOverrideHeaders(t *testing.T) {
	lookup := newMockLookup()
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("rejects duplicate model override header names ignoring case", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Overrides: []arkv1alpha1.Override{
					{ResourceType: "model", Headers: []arkv1alpha1.Header{{Name: "X-Tenant", Value: arkv1alpha1.HeaderValue{Value: "a"}}}},
					{ResourceType: "model", Headers: []arkv1alpha1.Header{{Name: "x-tenant", Value: arkv1alpha1.HeaderValue{Value: "b"}}}},
				},
			},
		}
		_, err := v.ValidateAgent(ctx, agent)
		if err == nil || !strings.Contains(err.Error(), "duplicate header name: x-tenant") {
			t.Fatalf("expected duplicate header error, got %v", err)
		}
	})

	t.Run("allows duplicate header names outside unselected model overrides", func(t *testing.T) {
		duplicates := []arkv1alpha1.Header{
			{Name: "X-Tenant", Value: arkv1alpha1.HeaderValue{Value: "a"}},
			{Name: "x-tenant", Value: arkv1alpha1.HeaderValue{Value: "b"}},
		}
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				Overrides: []arkv1alpha1.Override{
					{ResourceType: "model", Headers: []arkv1alpha1.Header{{Name: "X-Tenant", Value: arkv1alpha1.HeaderValue{Value: "a"}}}},
					{
						ResourceType:  "model",
						Headers:       duplicates,
						LabelSelector: &metav1.LabelSelector{MatchLabels: map[string]string{"env": "prod"}},
					},
					{ResourceType: "mcpserver", Headers: duplicates},
				},
			},
		}
		_, err := v.ValidateAgent(ctx, agent)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestValidateAgentToolApproval(t *testing.T) {
	v := NewValidator(newMockLookup())
	ctx := context.Background()

	positiveTimeout := &metav1.Duration{Duration: 5 * time.Minute}
	zeroTimeout := &metav1.Duration{Duration: 0}
	negativeTimeout := &metav1.Duration{Duration: -1 * time.Second}

	tests := []struct {
		name      string
		approval  *arkv1alpha1.ToolApprovalConfig
		expectErr bool
	}{
		{name: "nil approval config", approval: nil},
		{
			name:     "valid config with reject onTimeout",
			approval: &arkv1alpha1.ToolApprovalConfig{Required: true, Timeout: positiveTimeout, OnTimeout: "reject"},
		},
		{
			name:     "valid config with proceed onTimeout",
			approval: &arkv1alpha1.ToolApprovalConfig{Required: true, OnTimeout: "proceed"},
		},
		{
			name:     "empty onTimeout (defaults to reject)",
			approval: &arkv1alpha1.ToolApprovalConfig{Required: true},
		},
		{
			name:      "zero timeout is rejected",
			approval:  &arkv1alpha1.ToolApprovalConfig{Required: true, Timeout: zeroTimeout},
			expectErr: true,
		},
		{
			name:      "negative timeout is rejected",
			approval:  &arkv1alpha1.ToolApprovalConfig{Required: true, Timeout: negativeTimeout},
			expectErr: true,
		},
		{
			name:      "invalid onTimeout value is rejected",
			approval:  &arkv1alpha1.ToolApprovalConfig{Required: true, OnTimeout: "bogus"},
			expectErr: true,
		},
		{
			name: "valid argument matcher",
			approval: &arkv1alpha1.ToolApprovalConfig{
				Required:        true,
				ArgumentMatches: []arkv1alpha1.ArgumentMatch{{Argument: "path", Pattern: "^/var/run/secrets"}},
			},
		},
		{
			name: "matcher with empty argument is rejected",
			approval: &arkv1alpha1.ToolApprovalConfig{
				Required:        true,
				ArgumentMatches: []arkv1alpha1.ArgumentMatch{{Argument: "", Pattern: "x"}},
			},
			expectErr: true,
		},
		{
			name: "matcher with invalid regex is rejected",
			approval: &arkv1alpha1.ToolApprovalConfig{
				Required:        true,
				ArgumentMatches: []arkv1alpha1.ArgumentMatch{{Argument: "path", Pattern: "([unclosed"}},
			},
			expectErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			agent := &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{Name: "a", Namespace: "default"},
				Spec: arkv1alpha1.AgentSpec{
					Tools: []arkv1alpha1.AgentTool{{Type: "mcp", Name: "t", Approval: tt.approval}},
				},
			}
			_, err := v.ValidateAgent(ctx, agent)
			if tt.expectErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tt.expectErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestValidateAgentEngineToolWarning(t *testing.T) {
	lookup := newMockLookup()
	lookup.addResource("Tool", "default", "http-tool", &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: "http-tool", Namespace: "default"},
		Spec:       arkv1alpha1.ToolSpec{Type: "http"},
	})
	lookup.addResource("Tool", "default", "mcp-tool", &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: "mcp-tool", Namespace: "default"},
		Spec:       arkv1alpha1.ToolSpec{Type: "mcp"},
	})
	lookup.addResource("Tool", "default", "terminate", &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: "terminate", Namespace: "default"},
		Spec:       arkv1alpha1.ToolSpec{Type: "builtin"},
	})
	v := NewValidator(lookup)
	ctx := context.Background()

	engine := func(name string) *arkv1alpha1.ExecutionEngineRef {
		return &arkv1alpha1.ExecutionEngineRef{Name: name}
	}

	tests := []struct {
		name        string
		engine      *arkv1alpha1.ExecutionEngineRef
		tools       []arkv1alpha1.AgentTool
		wantWarning bool
		wantContain []string
	}{
		{
			name:        "engine with http tool warns",
			engine:      engine("executor-claude-agent-sdk"),
			tools:       []arkv1alpha1.AgentTool{{Type: "http", Name: "get-coordinates"}},
			wantWarning: true,
			wantContain: []string{"toolagent", "executor-claude-agent-sdk", "get-coordinates (http)", "only mcp tools"},
		},
		{
			name:        "engine lists every dropped tool",
			engine:      engine("mock-engine"),
			tools:       []arkv1alpha1.AgentTool{{Type: "http", Name: "a"}, {Type: "mcp", Name: "b"}, {Type: "team", Name: "c"}},
			wantWarning: true,
			wantContain: []string{"a (http)", "c (team)"},
		},
		{
			name:   "engine with mcp tool does not warn",
			engine: engine("mock-engine"),
			tools:  []arkv1alpha1.AgentTool{{Type: "mcp", Name: "echo"}},
		},
		{
			name:        "engine with built-in tool warns with the Tool CRD type",
			engine:      engine("mock-engine"),
			tools:       []arkv1alpha1.AgentTool{{Type: toolTypeBuiltIn, Name: "terminate"}},
			wantWarning: true,
			wantContain: []string{"terminate (builtin)"},
		},
		{
			name:   "engine with unresolvable built-in tool does not warn",
			engine: engine("mock-engine"),
			tools:  []arkv1alpha1.AgentTool{{Type: toolTypeBuiltIn, Name: "noop"}},
		},
		{
			name:        "engine with deprecated custom tool resolves the real type from the Tool CRD",
			engine:      engine("mock-engine"),
			tools:       []arkv1alpha1.AgentTool{{Type: toolTypeCustom, Name: "http-tool"}},
			wantWarning: true,
			wantContain: []string{"http-tool (http)"},
		},
		{
			name:   "engine with deprecated custom tool backed by an mcp Tool CRD does not warn",
			engine: engine("mock-engine"),
			tools:  []arkv1alpha1.AgentTool{{Type: toolTypeCustom, Name: "mcp-tool"}},
		},
		{
			name:   "engine with unresolvable custom tool does not warn",
			engine: engine("mock-engine"),
			tools:  []arkv1alpha1.AgentTool{{Type: toolTypeCustom, Name: "missing"}},
		},
		{
			name:        "engine with a partial tool resolves the underlying Tool CRD",
			engine:      engine("mock-engine"),
			tools:       []arkv1alpha1.AgentTool{{Type: toolTypeCustom, Name: "exposed", Partial: &arkv1alpha1.ToolPartial{Name: "http-tool"}}},
			wantWarning: true,
			wantContain: []string{"exposed (http)"},
		},
		{
			name:   "reserved a2a engine does not warn",
			engine: engine("a2a"),
			tools:  []arkv1alpha1.AgentTool{{Type: "http", Name: "get-coordinates"}},
		},
		{
			name:  "no engine does not warn",
			tools: []arkv1alpha1.AgentTool{{Type: "http", Name: "get-coordinates"}},
		},
		{
			name:   "engine with no tools does not warn",
			engine: engine("mock-engine"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			agent := &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{Name: "toolagent", Namespace: "default"},
				Spec: arkv1alpha1.AgentSpec{
					ExecutionEngine: tt.engine,
					Tools:           tt.tools,
				},
			}

			warnings, err := v.ValidateAgent(ctx, agent)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			assertEngineToolWarning(t, warnings, tt.wantWarning, tt.wantContain)
		})
	}
}

func assertEngineToolWarning(t *testing.T, warnings []string, wantWarning bool, wantContain []string) {
	t.Helper()

	if !wantWarning {
		if len(warnings) != 0 {
			t.Fatalf("expected no warnings, got %v", warnings)
		}
		return
	}

	if len(warnings) != 1 {
		t.Fatalf("expected exactly one warning, got %v", warnings)
	}
	for _, want := range wantContain {
		if !strings.Contains(warnings[0], want) {
			t.Errorf("warning %q missing %q", warnings[0], want)
		}
	}
}
