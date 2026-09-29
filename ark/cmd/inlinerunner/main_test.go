/* Copyright 2025. McKinsey & Company */

package main

import (
	"context"
	"io"
	"net"
	"net/http"
	"testing"
	"time"
)

// serve must not return until in-flight calls have drained. In main the
// return value ends the process, so returning while a handler is still
// running cuts the call; that ordering is the property under test, because an
// in-process test cannot observe the process exit itself.
func TestServeLetsAnInFlightCallFinishAfterCancellation(t *testing.T) {
	handlerEntered := make(chan struct{})
	handlerFinished := make(chan struct{})
	srv := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			close(handlerEntered)
			time.Sleep(300 * time.Millisecond)
			_, _ = w.Write([]byte("finished"))
			close(handlerFinished)
		}),
		ReadHeaderTimeout: time.Second,
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	served := make(chan error, 1)
	go func() { served <- serve(ctx, srv, listener, 5*time.Second) }()

	body := make(chan string, 1)
	go func() {
		// The request deliberately does not use ctx: cancelling ctx is what
		// starts the shutdown under test, and it must not abort this call.
		req, err := http.NewRequestWithContext(context.Background(), http.MethodGet,
			"http://"+listener.Addr().String(), nil)
		if err != nil {
			body <- "request build failed: " + err.Error()
			return
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			body <- "request failed: " + err.Error()
			return
		}
		defer func() { _ = resp.Body.Close() }()
		read, err := io.ReadAll(resp.Body)
		if err != nil {
			body <- "read failed: " + err.Error()
			return
		}
		body <- string(read)
	}()

	<-handlerEntered
	cancel()

	select {
	case err := <-served:
		select {
		case <-handlerFinished:
		default:
			t.Fatal("serve returned while a call was still running; in main that exits the process and cuts the call")
		}
		if err != nil {
			t.Errorf("serve returned %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("serve did not return after the drain completed")
	}

	if got := <-body; got != "finished" {
		t.Errorf("in-flight call did not complete across shutdown: got %q", got)
	}
}

// serve must not block on the drain when the listener itself fails.
func TestServeReturnsListenerErrorsWithoutWaiting(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	if err := listener.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	done := make(chan error, 1)
	go func() {
		done <- serve(context.Background(), &http.Server{ReadHeaderTimeout: time.Second}, listener, time.Second)
	}()

	select {
	case err := <-done:
		if err == nil {
			t.Error("expected the listener error to be returned")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("serve blocked on the drain after a listener error")
	}
}
