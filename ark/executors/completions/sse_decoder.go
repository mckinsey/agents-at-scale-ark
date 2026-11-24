/* Copyright 2025. McKinsey & Company */

package completions

import (
	"bufio"
	"bytes"
	"io"
	"mime"
	"net/http"

	"github.com/openai/openai-go/packages/ssestream"
)

const sseContentType = "text/event-stream"

// init installs a text/event-stream decoder that skips frames whose data buffer
// is empty or whitespace-only. Registration happens at package load so it covers
// every openai-go streaming path (OpenAI, Azure), not only providers that build
// a client first.
//
// Anthropic's OpenAI-compatible endpoint emits SSE keepalive comment frames
// (": ping - ...") roughly every 15s during a stream. The openai-go default
// decoder dispatches an event with an empty data buffer for such frames, which
// Stream.Next() then feeds to json.Unmarshal, producing "unexpected end of JSON
// input" and killing any response long enough to receive a keepalive. The
// WHATWG SSE spec says an event with an empty data buffer must not be
// dispatched, so we skip those frames here while leaving real data frames
// (including genuinely malformed JSON) untouched.
func init() {
	ssestream.RegisterDecoder(sseContentType, func(rc io.ReadCloser) ssestream.Decoder {
		scn := bufio.NewScanner(rc)
		scn.Buffer(nil, bufio.MaxScanTokenSize<<4)
		return &keepaliveTolerantDecoder{rc: rc, scn: scn}
	})
}

// sseContentTypeNormalizer canonicalizes a text/event-stream response header to
// the bare "text/event-stream" media type. openai-go's ssestream.NewDecoder
// looks up the decoder by the raw Content-Type value, case-sensitively and
// without stripping parameters, so a response like "text/event-stream;
// charset=UTF-8" would miss the registered decoder and fall back to the default
// one that breaks on keepalives. Normalizing here makes the lookup match.
type sseContentTypeNormalizer struct {
	base http.RoundTripper
}

func (n *sseContentTypeNormalizer) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := n.base.RoundTrip(req)
	if err != nil || resp == nil {
		return resp, err
	}
	if mediaType, _, mimeErr := mime.ParseMediaType(resp.Header.Get("Content-Type")); mimeErr == nil && mediaType == sseContentType {
		resp.Header.Set("Content-Type", sseContentType)
	}
	return resp, err
}

type keepaliveTolerantDecoder struct {
	evt ssestream.Event
	rc  io.ReadCloser
	scn *bufio.Scanner
	err error
}

func (d *keepaliveTolerantDecoder) Next() bool {
	if d.err != nil {
		return false
	}

	event := ""
	data := bytes.NewBuffer(nil)

	for d.scn.Scan() {
		txt := d.scn.Bytes()

		// A blank line terminates an event. Skip empty/whitespace-only data
		// buffers (comment-only keepalive frames, stray blank lines) so they
		// never reach json.Unmarshal.
		if len(txt) == 0 {
			if len(bytes.TrimSpace(data.Bytes())) == 0 {
				event = ""
				data.Reset()
				continue
			}
			d.evt = ssestream.Event{Type: event, Data: data.Bytes()}
			return true
		}

		name, value, _ := bytes.Cut(txt, []byte(":"))

		if len(value) > 0 && value[0] == ' ' {
			value = value[1:]
		}

		switch string(name) {
		case "":
			// ": comment" line, ignored per the SSE spec.
			continue
		case "event":
			event = string(value)
		case "data":
			if _, d.err = data.Write(value); d.err != nil {
				return false
			}
			if _, d.err = data.WriteRune('\n'); d.err != nil {
				return false
			}
		}
	}

	if d.scn.Err() != nil {
		d.err = d.scn.Err()
	}

	return false
}

func (d *keepaliveTolerantDecoder) Event() ssestream.Event {
	return d.evt
}

func (d *keepaliveTolerantDecoder) Close() error {
	return d.rc.Close()
}

func (d *keepaliveTolerantDecoder) Err() error {
	return d.err
}

var _ ssestream.Decoder = (*keepaliveTolerantDecoder)(nil)
