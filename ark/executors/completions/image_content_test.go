package completions

import (
	"encoding/base64"
	"testing"
	
	"github.com/stretchr/testify/assert"
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

