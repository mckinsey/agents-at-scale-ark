/* Copyright 2025. McKinsey & Company */

package completions

import (
	"bufio"
	"bytes"
	"io"
	"sync"

	"github.com/openai/openai-go/packages/ssestream"
)

var registerSSEDecoderOnce sync.Once

// registerKeepaliveTolerantSSEDecoder installs a text/event-stream decoder that
// skips frames whose data buffer is empty or whitespace-only.
//
// Anthropic's OpenAI-compatible endpoint emits SSE keepalive comment frames
// (": ping - ...") roughly every 15s during a stream. The openai-go default
// decoder dispatches an event with an empty data buffer for such frames, which
// Stream.Next() then feeds to json.Unmarshal, producing "unexpected end of JSON
// input" and killing any response long enough to receive a keepalive. The
// WHATWG SSE spec says an event with an empty data buffer must not be
// dispatched, so we skip those frames here while leaving real data frames
// (including genuinely malformed JSON) untouched.
func registerKeepaliveTolerantSSEDecoder() {
	registerSSEDecoderOnce.Do(func() {
		ssestream.RegisterDecoder("text/event-stream", func(rc io.ReadCloser) ssestream.Decoder {
			scn := bufio.NewScanner(rc)
			scn.Buffer(nil, bufio.MaxScanTokenSize<<4)
			return &keepaliveTolerantDecoder{rc: rc, scn: scn}
		})
	})
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
