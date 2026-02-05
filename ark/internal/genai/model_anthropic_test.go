package genai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"mckinsey.com/ark/internal/common"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
)

func TestLoadAnthropicConfig_NilConfig(t *testing.T) {
	fakeClient := fake.NewClientBuilder().Build()
	resolver := common.NewValueSourceResolver(fakeClient)

	model := &Model{
		Model: "claude-3-haiku-20240307",
		Type:  "anthropic",
	}

	ctx := context.Background()
	err := loadAnthropicConfig(ctx, resolver, nil, "default", model, nil)

	assert.Error(t, err)
	assert.Contains(t, err.Error(), "anthropic configuration is required")
}
