package completions

import (
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
)

func imageMessages(sizeBytes int) []Message {
	return []Message{
		NewUserMessage("read the receipt"),
		NewUserImageMessage("Image returned by the read tool.",
			[]ToolResultImage{newToolResultImage("image/png", make([]byte, sizeBytes))}),
	}
}

func BenchmarkConvertMessagesToAnthropicWithImage(b *testing.B) {
	messages := imageMessages(1 << 20)
	b.ReportAllocs()
	b.ResetTimer()
	for range b.N {
		_, _ = convertMessagesToAnthropic(messages)
	}
}

// The image is encoded once, where its bytes arrive. Building a request must not decode it
// back and re-encode it, which is what made a multi-megabyte image cost several copies of
// itself on every turn.
func TestConvertMessagesToAnthropicDoesNotDecodeImages(t *testing.T) {
	const imageBytes = 1 << 20
	messages := imageMessages(imageBytes)

	const runs = 5
	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	for range runs {
		_, _ = convertMessagesToAnthropic(messages)
	}
	runtime.ReadMemStats(&after)

	perRun := (after.TotalAlloc - before.TotalAlloc) / runs
	t.Logf("allocated %d bytes per conversion of a %d byte image", perRun, imageBytes)

	// Rendering necessarily writes the encoded payload into the JSON body, roughly 4/3 of the
	// image. A decode plus a re-encode would add about 7/3 more on top.
	assert.Less(t, perRun, uint64(3*imageBytes),
		"a conversion should cost about one encoded copy of the image, not several")
}

func TestBase64DecodedLen(t *testing.T) {
	for _, size := range []int{1, 2, 3, 4, 5, 100, 1023} {
		encoded := newToolResultImage("image/png", make([]byte, size)).B64
		decodedLen, ok := base64DecodedLen(encoded)
		assert.True(t, ok, encoded)
		assert.Equal(t, size, decodedLen, "size %d", size)
	}

	for _, invalid := range []string{"", "abc", "!!!!", "a===", "====", "ab=c"} {
		_, ok := base64DecodedLen(invalid)
		assert.False(t, ok, invalid)
	}
}
