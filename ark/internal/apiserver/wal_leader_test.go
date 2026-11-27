/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"testing/fstest"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	k8stesting "k8s.io/client-go/testing"
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

var fastLeaseTiming = leaseTiming{
	leaseDuration: 2 * time.Second,
	renewDeadline: time.Second,
	retryPeriod:   100 * time.Millisecond,
}

func TestWALConsumer_WithoutElectionRunsConsumerDirectly(t *testing.T) {
	t.Parallel()

	started := make(chan struct{})
	ready := make(chan struct{})
	close(ready)
	s := New(Config{})
	w, err := s.WALConsumer()
	if err != nil {
		t.Fatalf("WALConsumer() error = %v", err)
	}
	w.ready = ready
	w.run = func(ctx context.Context) {
		close(started)
		<-ctx.Done()
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Start(ctx) }()
	waitFor(t, "consumer to start without leader election", started)
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("WAL leader did not stop after context cancellation")
	}
}

func TestWALConsumer_FailsWithoutNamespaceFile(t *testing.T) {
	t.Parallel()

	s := New(Config{WALLeaderElection: true, RestConfig: &rest.Config{Host: "http://127.0.0.1:1"}})
	if _, err := s.WALConsumer(); err == nil {
		t.Fatal("expected error when the service account namespace file is missing")
	}
}

func TestReadLeaseNamespace(t *testing.T) {
	t.Parallel()

	got, err := readLeaseNamespace(fstest.MapFS{"namespace": {Data: []byte("ark-system\n")}})
	if err != nil || got != "ark-system" {
		t.Errorf("readLeaseNamespace(valid) = %q, %v; want ark-system, nil", got, err)
	}
	if _, err := readLeaseNamespace(fstest.MapFS{"namespace": {Data: []byte("  \n")}}); err == nil {
		t.Error("readLeaseNamespace(empty) = nil error, want error")
	}
	if _, err := readLeaseNamespace(fstest.MapFS{}); err == nil {
		t.Error("readLeaseNamespace(missing) = nil error, want error")
	}
}

func TestNewLeaseCampaignFromConfig_RequiresRestConfig(t *testing.T) {
	t.Parallel()

	if _, err := newLeaseCampaignFromConfig(nil, fstest.MapFS{}); err == nil {
		t.Fatal("expected error for nil rest config")
	}
}

func TestLeaseCampaign_RunsConsumerWhileHoldingLeaseAndWaitsForItOnStop(t *testing.T) {
	t.Parallel()

	cs := fake.NewSimpleClientset()
	campaign := newLeaseCampaign(cs, "ark-system", "pod-a", fastLeaseTiming)

	leading := make(chan struct{})
	var finished atomic.Bool
	ctx, cancel := context.WithCancel(context.Background())
	returned := make(chan struct{})
	go func() {
		defer close(returned)
		campaign(ctx, func(leaderCtx context.Context) {
			close(leading)
			<-leaderCtx.Done()
			time.Sleep(100 * time.Millisecond)
			finished.Store(true)
		})
	}()

	waitFor(t, "lease to be acquired", leading)
	lease, err := cs.CoordinationV1().Leases("ark-system").Get(context.Background(), WALLeaseName, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("get lease: %v", err)
	}
	if lease.Spec.HolderIdentity == nil || *lease.Spec.HolderIdentity != "pod-a" {
		t.Errorf("lease holder = %v, want pod-a", lease.Spec.HolderIdentity)
	}

	cancel()
	waitFor(t, "campaign to return", returned)
	if !finished.Load() {
		t.Error("campaign returned before the consumer finished stopping")
	}
}

func TestLeaseCampaign_CancelsConsumerWhenRenewalFails(t *testing.T) {
	t.Parallel()

	cs := fake.NewSimpleClientset()
	campaign := newLeaseCampaign(cs, "ark-system", "pod-a", fastLeaseTiming)

	var failUpdates atomic.Bool
	cs.PrependReactor("update", "leases", func(k8stesting.Action) (bool, runtime.Object, error) {
		if failUpdates.Load() {
			return true, nil, errors.New("apiserver unavailable")
		}
		return false, nil, nil
	})

	leading := make(chan struct{})
	stopped := make(chan struct{})
	returned := make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		defer close(returned)
		campaign(ctx, func(leaderCtx context.Context) {
			close(leading)
			<-leaderCtx.Done()
			close(stopped)
		})
	}()

	waitFor(t, "lease to be acquired", leading)
	failUpdates.Store(true)
	waitFor(t, "consumer to be cancelled after renewal failure", stopped)
	waitFor(t, "campaign to return after lease loss", returned)
	if ctx.Err() != nil {
		t.Error("lease loss cancelled the parent context")
	}
}

func TestLeaseCampaign_OnlyOneCandidateLeadsAtATime(t *testing.T) {
	t.Parallel()

	cs := fake.NewSimpleClientset()
	var leaders, maxLeaders atomic.Int32
	firstLeading := make(chan struct{}, 2)

	run := func(identity string) (context.CancelFunc, <-chan struct{}) {
		campaign := newLeaseCampaign(cs, "ark-system", identity, fastLeaseTiming)
		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		go func() {
			defer close(done)
			campaign(ctx, func(leaderCtx context.Context) {
				n := leaders.Add(1)
				for {
					m := maxLeaders.Load()
					if n <= m || maxLeaders.CompareAndSwap(m, n) {
						break
					}
				}
				firstLeading <- struct{}{}
				<-leaderCtx.Done()
				leaders.Add(-1)
			})
		}()
		return cancel, done
	}

	cancelA, doneA := run("pod-a")
	cancelB, doneB := run("pod-b")

	select {
	case <-firstLeading:
	case <-time.After(5 * time.Second):
		t.Fatal("no candidate became leader")
	}
	time.Sleep(time.Second)
	if got := maxLeaders.Load(); got != 1 {
		t.Errorf("concurrent leaders = %d, want 1", got)
	}

	cancelA()
	cancelB()
	waitFor(t, "candidate A to stop", doneA)
	waitFor(t, "candidate B to stop", doneB)
}

func TestNewLeaseCampaignFromConfig_BuildsCampaign(t *testing.T) {
	t.Parallel()

	secrets := fstest.MapFS{"namespace": {Data: []byte("ark-system")}}
	campaign, err := newLeaseCampaignFromConfig(&rest.Config{Host: "http://127.0.0.1:1"}, secrets)
	if err != nil {
		t.Fatalf("newLeaseCampaignFromConfig() error = %v", err)
	}
	if campaign == nil {
		t.Fatal("newLeaseCampaignFromConfig() returned a nil campaign")
	}
}

func TestNewLeaseCampaignFromConfig_FailsWithoutNamespace(t *testing.T) {
	t.Parallel()

	_, err := newLeaseCampaignFromConfig(&rest.Config{Host: "http://127.0.0.1:1"}, fstest.MapFS{})
	if err == nil {
		t.Fatal("expected error when the namespace file is missing")
	}
}

func TestLeaseCampaign_InvalidTimingNeverLeads(t *testing.T) {
	t.Parallel()

	campaign := newLeaseCampaign(fake.NewSimpleClientset(), "ark-system", "pod-a", leaseTiming{
		leaseDuration: time.Second,
		renewDeadline: 2 * time.Second,
		retryPeriod:   100 * time.Millisecond,
	})
	var led atomic.Bool
	campaign(context.Background(), func(context.Context) { led.Store(true) })
	if led.Load() {
		t.Error("campaign led despite an invalid lease timing configuration")
	}
}
