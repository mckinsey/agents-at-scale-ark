package completions

import "strings"

const (
	dataURLPrefix = "data:"
	base64Marker  = ";base64,"
)

// imageFromDataURL parses the grammar DataURL writes. The payload is kept encoded: decoding a
// multi-megabyte image only to re-encode it for the provider is the cost this avoids, so the
// base64 is validated by a scan and its decoded length derived by arithmetic.
func imageFromDataURL(url string) (ToolResultImage, bool) {
	rest, ok := strings.CutPrefix(url, dataURLPrefix)
	if !ok {
		return ToolResultImage{}, false
	}

	mediaType, b64, ok := strings.Cut(rest, base64Marker)
	if !ok {
		return ToolResultImage{}, false
	}

	normalized, ok := normalizeImageMediaType(mediaType)
	if !ok {
		return ToolResultImage{}, false
	}

	decodedLen, ok := base64DecodedLen(b64)
	if !ok {
		return ToolResultImage{}, false
	}

	return ToolResultImage{MediaType: normalized, B64: b64, Bytes: decodedLen}, true
}

// base64DecodedLen validates standard padded base64 and returns the length it decodes to,
// without allocating the decoded bytes.
func base64DecodedLen(s string) (int, bool) {
	if s == "" || len(s)%4 != 0 {
		return 0, false
	}

	padding := 0
	for len(s) > 0 && s[len(s)-1] == '=' {
		padding++
		s = s[:len(s)-1]
	}
	if padding > 2 {
		return 0, false
	}

	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '+', c == '/':
		default:
			return 0, false
		}
	}

	return (len(s)+padding)/4*3 - padding, true
}
