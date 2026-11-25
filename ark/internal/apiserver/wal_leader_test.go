/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func waitFor(t *testing.T, what string, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(5 * time.Second):
		t.Fatalf("timed out waiting for %s", what)
	}
}

func TestWALLeader_DoesNotNeedManagerLeaderElection(t *testing.T) {
	t.Parallel()

	s := New(Config{})
	if s.NeedLeaderElection() {
		t.Error("Server must serve on every replica: NeedLeaderElection() = true, want false")
	}
	w, err := s.WALConsumer()
	if err != nil {
		t.Fatalf("WALConsumer() error = %v", err)
	}
	if w.NeedLeaderElection() {
		t.Error("WAL leader runs its own election: NeedLeaderElection() = true, want false so the manager never exits on lease loss")
	}
}

func TestWALConsumer_RequiresRestConfigForElection(t *testing.T) {
	t.Parallel()

	s := New(Config{WALLeaderElection: true})
	if _, err := s.WALConsumer(); err == nil {
		t.Fatal("expected error when leader election is on and no rest config is set")
	}
}

func TestWALLeader_StopsWhenBackendNeverReady(t *testing.T) {
	t.Parallel()

	w := &walLeader{ready: make(chan struct{})}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Start(ctx) }()
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("Start() = %v, want nil", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("WAL leader did not stop on context cancellation")
	}
}

func TestWALLeader_RunsConsumerWhenLeading(t *testing.T) {
	t.Parallel()

	ready := make(chan struct{})
	started := make(chan struct{})
	w := &walLeader{
		ready: ready,
		campaign: func(ctx context.Context, onLeading func(context.Context)) {
			onLeading(ctx)
		},
		run: func(ctx context.Context) {
			select {
			case <-started:
			default:
				close(started)
			}
			<-ctx.Done()
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Start(ctx) }()

	close(ready)
	waitFor(t, "WAL consumer to start", started)

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("Start() = %v, want nil", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("WAL leader did not stop after context cancellation")
	}
}

func TestWALLeader_SurvivesLeaseLossAndCampaignsAgain(t *testing.T) {
	t.Parallel()

	ready := make(chan struct{})
	close(ready)

	var campaigns atomic.Int32
	firstStopped := make(chan struct{})
	secondStarted := make(chan struct{})

	w := &walLeader{
		ready: ready,
		campaign: func(ctx context.Context, onLeading func(context.Context)) {
			n := campaigns.Add(1)
			leaderCtx, loseLease := context.WithCancel(ctx)
			defer loseLease()
			if n == 1 {
				go func() {
					<-time.After(50 * time.Millisecond)
					loseLease()
				}()
			}
			onLeading(leaderCtx)
		},
		run: func(ctx context.Context) {
			if campaigns.Load() == 2 {
				close(secondStarted)
			}
			<-ctx.Done()
			if campaigns.Load() == 1 {
				close(firstStopped)
			}
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Start(ctx) }()

	waitFor(t, "first consumer to stop on lease loss", firstStopped)
	select {
	case err := <-done:
		t.Fatalf("Start() returned %v after lease loss, want it to keep running", err)
	default:
	}
	waitFor(t, "consumer to restart after re-acquiring the lease", secondStarted)

	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("WAL leader did not stop after context cancellation")
	}
}
