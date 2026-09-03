package completions

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"testing"

	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeImageMediaType(t *testing.T) {
	supported := []struct {
		in   string
		want string
	}{
		{"image/png", "image/png"},
		{"image/jpeg", "image/jpeg"},
		{"image/gif", "image/gif"},
		{"image/webp", "image/webp"},
		{"image/png;charset=utf-8", "image/png"},
		{"image/jpeg;foo=bar;baz=qux", "image/jpeg"},
		{"IMAGE/PNG", "image/png"},
		{"  image/png  ", "image/png"},
		{"image/jpg", "image/jpeg"},
		{"IMAGE/JPG;charset=utf-8", "image/jpeg"},
	}
	for _, tc := range supported {
		got, ok := normalizeImageMediaType(tc.in)
		assert.True(t, ok, tc.in)
		assert.Equal(t, tc.want, got, tc.in)
	}

	unsupported := []string{
		"",
		";base64",
		"image/svg+xml",
		"image/bmp",
		"image/tiff",
		"application/pdf",
		"text/plain",
		"image",
		"png",
	}
	for _, in := range unsupported {
		_, ok := normalizeImageMediaType(in)
		assert.False(t, ok, in)
	}
}

func TestImageFromDataURLNormalizesMediaType(t *testing.T) {
	encoded := base64.StdEncoding.EncodeToString(pngBytes)

	t.Run("a parameter is stripped rather than sent as the media type", func(t *testing.T) {
		image, ok := imageFromDataURL("data:image/png;charset=utf-8;base64," + encoded)
		require.True(t, ok)
		assert.Equal(t, "image/png", image.MediaType)
		assert.Equal(t, base64.StdEncoding.EncodeToString(pngBytes), image.B64)
	})

	t.Run("the informal jpeg spelling is normalized", func(t *testing.T) {
		image, ok := imageFromDataURL("data:image/jpg;base64," + encoded)
		require.True(t, ok)
		assert.Equal(t, "image/jpeg", image.MediaType)
	})

	t.Run("an unsupported media type is rejected", func(t *testing.T) {
		for _, mediaType := range []string{"image/svg+xml", "image/bmp", "application/pdf"} {
			_, ok := imageFromDataURL("data:" + mediaType + ";base64," + encoded)
			assert.False(t, ok, mediaType)
		}
	})
}

func TestCollectContentCarriesSupportedImages(t *testing.T) {
	executor := &MCPExecutor{ToolName: "read"}

	text, images := executor.collectContent(context.Background(), []mcpsdk.Content{
		&mcpsdk.TextContent{Text: "here is the page"},
		&mcpsdk.ImageContent{MIMEType: "image/png;charset=utf-8", Data: pngBytes},
	})

	require.Len(t, images, 1)
	assert.Equal(t, "image/png", images[0].MediaType)
	assert.Equal(t, base64.StdEncoding.EncodeToString(pngBytes), images[0].B64)
	assert.Contains(t, text, "here is the page")
	assert.NotContains(t, text, base64.StdEncoding.EncodeToString(pngBytes))
}

func TestCollectContentDropsUnsupportedImage(t *testing.T) {
	executor := &MCPExecutor{ToolName: "render"}

	text, images := executor.collectContent(context.Background(), []mcpsdk.Content{
		&mcpsdk.ImageContent{MIMEType: "image/svg+xml", Data: pngBytes},
	})

	assert.Empty(t, images, "an unsupported image must not reach the provider")
	assert.Contains(t, text, "image/svg+xml")
	assert.Contains(t, text, "not shown to the model")
}

func TestImageMessageWireShapeForOpenAIProviders(t *testing.T) {
	msg := NewUserImageMessage("Image returned by the read tool.",
		[]ToolResultImage{newToolResultImage("image/png", pngBytes)})

	raw, err := json.Marshal(openai.ChatCompletionMessageParamUnion(msg))
	require.NoError(t, err)

	var payload struct {
		Role    string `json:"role"`
		Content []struct {
			Type     string `json:"type"`
			Text     string `json:"text"`
			ImageURL struct {
				URL string `json:"url"`
			} `json:"image_url"`
		} `json:"content"`
	}
	require.NoError(t, json.Unmarshal(raw, &payload))

	assert.Equal(t, RoleUser, payload.Role)
	require.Len(t, payload.Content, 2)
	assert.Equal(t, "text", payload.Content[0].Type)
	assert.Equal(t, "Image returned by the read tool.", payload.Content[0].Text)
	assert.Equal(t, "image_url", payload.Content[1].Type)
	assert.Equal(t,
		"data:image/png;base64,"+base64.StdEncoding.EncodeToString(pngBytes),
		payload.Content[1].ImageURL.URL)
}
