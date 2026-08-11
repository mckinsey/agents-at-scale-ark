package completions

import (
	"encoding/base64"
	"strings"
	"testing"
	
	mcpsdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var pngBytes = []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe}

func TestToolResultImageEncoding(t *testing.T) {
	image := ToolResultImage{MediaType: "image/png", Data: pngBytes}

	t.Run("base64 is of the raw bytes", func(t *testing.T) {
		assert.Equal(t, base64.StdEncoding.EncodeToString(pngBytes), image.Base64())
	})

	t.Run("data url carries media type and base64", func(t *testing.T) {
		assert.Equal(t, "data:image/png;base64,"+image.Base64(), image.DataURL())
	})
}

func TestMCPImageContentIsNotFlattened(t *testing.T) {
	content := []mcpsdk.Content{
		&mcpsdk.TextContent{Text: "here is the page"},
		&mcpsdk.ImageContent{MIMEType: "image/png", Data: pngBytes},
	}

	var text strings.Builder
	var images []ToolResultImage
	for _, part := range content {
		switch typed := part.(type) {
		case *mcpsdk.TextContent:
			text.WriteString(typed.Text)
		case *mcpsdk.ImageContent:
			images = append(images, ToolResultImage{MediaType: typed.MIMEType, Data: typed.Data})
		}
	}

	require.Len(t, images, 1)
	assert.Equal(t, pngBytes, images[0].Data)
	assert.Equal(t, "here is the page", text.String())
	assert.NotContains(t, text.String(), base64.StdEncoding.EncodeToString(pngBytes))
}

