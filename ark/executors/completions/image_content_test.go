package completions

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"testing"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var pngBytes = []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe}

func TestToolResultImageEncoding(t *testing.T) {
	image := newToolResultImage("image/png", pngBytes)

	t.Run("base64 is of the raw bytes", func(t *testing.T) {
		assert.Equal(t, base64.StdEncoding.EncodeToString(pngBytes), image.Base64())
	})

	t.Run("data url carries media type and base64", func(t *testing.T) {
		assert.Equal(t, "data:image/png;base64,"+image.Base64(), image.DataURL())
	})

	t.Run("data url round-trips", func(t *testing.T) {
		back, ok := imageFromDataURL(image.DataURL())
		require.True(t, ok)
		assert.Equal(t, "image/png", back.MediaType)
		assert.Equal(t, base64.StdEncoding.EncodeToString(pngBytes), back.B64)
		assert.Equal(t, len(pngBytes), back.Bytes)
	})

	t.Run("a non-data url is rejected rather than sent as text", func(t *testing.T) {
		for _, url := range []string{
			"https://example.com/cat.png",
			"data:image/png,notbase64",
			"data:;base64," + image.Base64(),
			"data:image/png;base64,!!!not-base64!!!",
		} {
			_, ok := imageFromDataURL(url)
			assert.False(t, ok, url)
		}
	})
}

func TestMCPImageContentIsNotFlattened(t *testing.T) {
	content := []mcpsdk.Content{
		&mcpsdk.TextContent{Text: "here is the page"},
		&mcpsdk.ImageContent{MIMEType: "image/png", Data: pngBytes},
	}

	executor := &MCPExecutor{ToolName: "read"}
	text, images := executor.collectContent(context.Background(), content)

	require.Len(t, images, 1)
	assert.Equal(t, base64.StdEncoding.EncodeToString(pngBytes), images[0].B64)
	assert.Contains(t, text, "here is the page")
	assert.NotContains(t, text, base64.StdEncoding.EncodeToString(pngBytes))
}

func TestNewUserImageMessageCarriesImageParts(t *testing.T) {
	msg := NewUserImageMessage("Image returned by the read tool.",
		[]ToolResultImage{newToolResultImage("image/png", pngBytes)})

	text, images, role := extractMessageParts(msg)
	assert.Equal(t, RoleUser, role)
	assert.Equal(t, "Image returned by the read tool.", text)
	require.Len(t, images, 1)
	assert.Equal(t, "image/png", images[0].MediaType)
	assert.Equal(t, base64.StdEncoding.EncodeToString(pngBytes), images[0].B64)
}

func TestRenderAnthropicContent(t *testing.T) {
	t.Run("text only is a bare string", func(t *testing.T) {
		raw := renderAnthropicContent("just text", nil, false)
		assert.JSONEq(t, `"just text"`, string(raw))
	})

	t.Run("an image becomes an image block, not base64 text", func(t *testing.T) {
		raw := renderAnthropicContent("what does this say?",
			[]ToolResultImage{newToolResultImage("image/png", pngBytes)}, false)

		var blocks []map[string]any
		require.NoError(t, json.Unmarshal(raw, &blocks))
		require.Len(t, blocks, 2)

		assert.Equal(t, "image", blocks[0]["type"])
		source, ok := blocks[0]["source"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, "base64", source["type"])
		assert.Equal(t, "image/png", source["media_type"])
		assert.Equal(t, base64.StdEncoding.EncodeToString(pngBytes), source["data"])
		assert.NotContains(t, blocks[0], "text")

		assert.Equal(t, "text", blocks[1]["type"])
		assert.Equal(t, "what does this say?", blocks[1]["text"])
	})

	t.Run("an image with no caption is a lone image block", func(t *testing.T) {
		raw := renderAnthropicContent("",
			[]ToolResultImage{newToolResultImage("image/png", pngBytes)}, false)

		var blocks []map[string]any
		require.NoError(t, json.Unmarshal(raw, &blocks))
		require.Len(t, blocks, 1)
		assert.Equal(t, "image", blocks[0]["type"])
	})

	t.Run("a cached image message keeps its cache breakpoint", func(t *testing.T) {
		raw := renderAnthropicContent("what does this say?",
			[]ToolResultImage{newToolResultImage("image/png", pngBytes)}, true)

		var blocks []anthropicContentBlock
		require.NoError(t, json.Unmarshal(raw, &blocks))
		require.Len(t, blocks, 2)
		assert.Nil(t, blocks[0].CacheControl)
		require.NotNil(t, blocks[1].CacheControl)
		assert.Equal(t, "ephemeral", blocks[1].CacheControl.Type)
	})
}

func TestConvertMessagesToAnthropicKeepsImages(t *testing.T) {
	messages := []Message{
		NewUserMessage("read receipt.png"),
		NewUserImageMessage("Image returned by the read tool.",
			[]ToolResultImage{newToolResultImage("image/png", pngBytes)}),
		NewUserMessage("what does it say?"),
	}

	converted, _ := convertMessagesToAnthropic(messages)
	require.Len(t, converted, 3, "the image message must not be dropped")

	assert.JSONEq(t, `"read receipt.png"`, string(converted[0].Content))

	var blocks []map[string]any
	require.NoError(t, json.Unmarshal(converted[1].Content, &blocks))
	assert.Equal(t, "image", blocks[0]["type"])
	source, ok := blocks[0]["source"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, base64.StdEncoding.EncodeToString(pngBytes), source["data"])
}
