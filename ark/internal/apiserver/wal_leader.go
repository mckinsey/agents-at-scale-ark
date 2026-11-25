/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"k8s.io/apimachinery/pkg/util/uuid"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/leaderelection"
	"k8s.io/client-go/tools/leaderelection/resourcelock"
	"k8s.io/klog/v2"
)

const (
	WALLeaseName       = "ark-apiserver-leader"
	walLeaseDuration   = 15 * time.Second
	walRenewDeadline   = 10 * time.Second
	walRetryPeriod     = 2 * time.Second
	namespaceDir       = "/var/run/secrets/kubernetes.io/serviceaccount"
	namespaceFileName  = "namespace"
	walCampaignBackoff = time.Second
)

type campaignFunc func(ctx context.Context, onLeading func(ctx context.Context))

type walLeader struct {
	ready    <-chan struct{}
	campaign campaignFunc
	run      func(ctx context.Context)
}

func (w *walLeader) Start(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return nil
	case <-w.ready:
	}

	for ctx.Err() == nil {
		w.campaign(ctx, func(leaderCtx context.Context) {
			klog.Info("Leader lease acquired; starting WAL consumer")
			w.run(leaderCtx)
		})
		if ctx.Err() != nil {
			return nil
		}
		klog.Warning("Leader lease lost; WAL consumer stopped, API keeps serving, campaigning again")
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(walCampaignBackoff):
		}
	}
	return nil
}

func (w *walLeader) NeedLeaderElection() bool {
	return false
}

func (s *Server) WALConsumer() (*walLeader, error) {
	w := &walLeader{
		ready: s.backendReady,
		run:   func(ctx context.Context) { s.backend.RunWALConsumer(ctx) },
	}
	if !s.config.WALLeaderElection {
		w.campaign = func(ctx context.Context, onLeading func(ctx context.Context)) {
			onLeading(ctx)
			<-ctx.Done()
		}
		return w, nil
	}
	campaign, err := newLeaseCampaignFromConfig(s.config.RestConfig, os.DirFS(namespaceDir))
	if err != nil {
		return nil, err
	}
	w.campaign = campaign
	return w, nil
}

type leaseTiming struct {
	leaseDuration time.Duration
	renewDeadline time.Duration
	retryPeriod   time.Duration
}

var defaultLeaseTiming = leaseTiming{
	leaseDuration: walLeaseDuration,
	renewDeadline: walRenewDeadline,
	retryPeriod:   walRetryPeriod,
}

func newLeaseCampaignFromConfig(restConfig *rest.Config, secrets fs.FS) (campaignFunc, error) {
	if restConfig == nil {
		return nil, fmt.Errorf("WAL leader election requires a rest config")
	}
	namespace, err := readLeaseNamespace(secrets)
	if err != nil {
		return nil, err
	}
	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("create clientset for WAL leader election: %w", err)
	}
	hostname, err := os.Hostname()
	if err != nil {
		return nil, fmt.Errorf("resolve hostname for WAL leader election: %w", err)
	}
	identity := hostname + "_" + string(uuid.NewUUID())
	return newLeaseCampaign(clientset, namespace, identity, defaultLeaseTiming), nil
}

func newLeaseCampaign(clientset kubernetes.Interface, namespace, identity string, timing leaseTiming) campaignFunc {
	return func(ctx context.Context, onLeading func(ctx context.Context)) {
		lock, err := resourcelock.New(
			resourcelock.LeasesResourceLock,
			namespace,
			WALLeaseName,
			clientset.CoreV1(),
			clientset.CoordinationV1(),
			resourcelock.ResourceLockConfig{Identity: identity},
		)
		if err != nil {
			klog.Errorf("WAL lease lock: %v", err)
			return
		}
		var started atomic.Bool
		done := make(chan struct{})
		elector, err := leaderelection.NewLeaderElector(leaderelection.LeaderElectionConfig{
			Lock:          lock,
			LeaseDuration: timing.leaseDuration,
			RenewDeadline: timing.renewDeadline,
			RetryPeriod:   timing.retryPeriod,
			Name:          WALLeaseName,
			Callbacks: leaderelection.LeaderCallbacks{
				OnStartedLeading: func(leaderCtx context.Context) {
					started.Store(true)
					defer close(done)
					onLeading(leaderCtx)
				},
				OnStoppedLeading: func() {},
			},
		})
		if err != nil {
			klog.Errorf("WAL leader elector: %v", err)
			return
		}
		elector.Run(ctx)
		if started.Load() {
			<-done
		}
	}
}

func readLeaseNamespace(secrets fs.FS) (string, error) {
	data, err := fs.ReadFile(secrets, namespaceFileName)
	if err != nil {
		return "", fmt.Errorf("read lease namespace: %w", err)
	}
	ns := strings.TrimSpace(string(data))
	if ns == "" {
		return "", fmt.Errorf("lease namespace file %s is empty", namespaceFileName)
	}
	return ns, nil
}
