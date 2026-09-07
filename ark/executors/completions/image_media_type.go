package completions

import (
	"mime"
	"strings"
)

var supportedImageMediaTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

func normalizeImageMediaType(mediaType string) (string, bool) {
	base, _, err := mime.ParseMediaType(mediaType)
	if err != nil {
		base, _, _ = strings.Cut(mediaType, ";")
		base = strings.ToLower(strings.TrimSpace(base))
	}
	if base == "image/jpg" {
		base = "image/jpeg"
	}
	if !supportedImageMediaTypes[base] {
		return "", false
	}
	return base, true
}
