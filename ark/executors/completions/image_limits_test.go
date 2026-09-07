package completions

import (
	"context"
	"encoding/base64"
	"fmt"
	"testing"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestToolImageLimitsFromEnv(t *testing.T) {
	t.Run("defaults apply when the variables are absent", func(t *testing.T) {
		t.Setenv(toolImageMaxBytesEnv, "")
		t.Setenv(toolImageMaxPerToolCallEnv, "")
		t.Setenv(toolImageMaxBytesPerTurnEnv, "")

		limits := toolImageLimitsFromEnv()
		assert.Equal(t, defaultToolImageMaxBytes, limits.MaxBytes)
		assert.Equal(t, defaultToolImageMaxPerToolCall, limits.MaxPerToolCall)
		assert.Equal(t, defaultToolImageMaxBytesPerTurn, limits.MaxBytesPerTurn)
	})

	t.Run("a valid override is applied", func(t *testing.T) {
		t.Setenv(toolImageMaxBytesEnv, "1024")
		t.Setenv(toolImageMaxPerToolCallEnv, "2")
		t.Setenv(toolImageMaxBytesPerTurnEnv, "4096")

		limits := toolImageLimitsFromEnv()
		assert.Equal(t, 1024, limits.MaxBytes)
		assert.Equal(t, 2, limits.MaxPerToolCall)
		assert.Equal(t, 4096, limits.MaxBytesPerTurn)
	})

	t.Run("an unusable override falls back to the default", func(t *testing.T) {
		for _, value := range []string{"", "0", "-1", "many"} {
			t.Setenv(toolImageMaxBytesEnv, value)
			t.Setenv(toolImageMaxPerToolCallEnv, value)
			t.Setenv(toolImageMaxBytesPerTurnEnv, value)

			limits := toolImageLimitsFromEnv()
			assert.Equal(t, defaultToolImageMaxBytes, limits.MaxBytes, value)
			assert.Equal(t, defaultToolImageMaxPerToolCall, limits.MaxPerToolCall, value)
			assert.Equal(t, defaultToolImageMaxBytesPerTurn, limits.MaxBytesPerTurn, value)
		}
	})
}

func TestCollectContentDropsOversizedImage(t *testing.T) {
	executor := &MCPExecutor{ToolName: "read", ImagePolicy: testImagePolicy(toolImageLimits{
		MaxBytes:       10,
		MaxPerToolCall: defaultToolImageMaxPerToolCall,
	})}

	t.Run("an image over the limit is dropped with a breadcrumb", func(t *testing.T) {
		oversized := make([]byte, 11)
		text, images := executor.collectContent(context.Background(), []mcpsdk.Content{
			&mcpsdk.ImageContent{MIMEType: "image/png", Data: oversized},
		})

		assert.Empty(t, images, "an oversized image must not reach the provider")
		assert.Contains(t, text, "11 bytes")
		assert.Contains(t, text, "exceeds the 10 byte limit")
		assert.Contains(t, text, "not shown to the model")
	})

	t.Run("an image exactly at the limit is kept", func(t *testing.T) {
		exact := make([]byte, 10)
		_, images := executor.collectContent(context.Background(), []mcpsdk.Content{
			&mcpsdk.ImageContent{MIMEType: "image/png", Data: exact},
		})

		require.Len(t, images, 1)
		assert.Equal(t, len(exact), images[0].Bytes)
	})
}

func TestCollectContentCapsImagesPerToolCall(t *testing.T) {
	executor := &MCPExecutor{ToolName: "read", ImagePolicy: testImagePolicy(toolImageLimits{
		MaxBytes:       defaultToolImageMaxBytes,
		MaxPerToolCall: 4,
	})}

	want := make([][]byte, 0, 5)
	contents := make([]mcpsdk.Content, 0, 5)
	for i := range 5 {
		data := []byte{0x89, 'P', 'N', 'G', byte(i)}
		want = append(want, data)
		contents = append(contents, &mcpsdk.ImageContent{MIMEType: "image/png", Data: data})
	}

	text, images := executor.collectContent(context.Background(), contents)

	require.Len(t, images, 4, "the fifth image must be dropped")
	for i := range images {
		assert.Equal(t, base64.StdEncoding.EncodeToString(want[i]), images[i].B64)
	}
	assert.Contains(t, text, "image limit of 4 per tool call reached")
}

func TestCollectContentLimitsAreConfigurable(t *testing.T) {
	executor := &MCPExecutor{ToolName: "read", ImagePolicy: testImagePolicy(toolImageLimits{
		MaxBytes:       defaultToolImageMaxBytes,
		MaxPerToolCall: 1,
	})}

	text, images := executor.collectContent(context.Background(), []mcpsdk.Content{
		&mcpsdk.ImageContent{MIMEType: "image/png", Data: pngBytes},
		&mcpsdk.ImageContent{MIMEType: "image/png", Data: pngBytes},
	})

	require.Len(t, images, 1)
	assert.Contains(t, text, fmt.Sprintf("image limit of %d per tool call reached", 1))
}

func testImagePolicy(limits toolImageLimits) *imagePolicy {
	if limits.MaxBytesPerTurn == 0 {
		limits.MaxBytesPerTurn = defaultToolImageMaxBytesPerTurn
	}
	return newImagePolicy(limits)
}
