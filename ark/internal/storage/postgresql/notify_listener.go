/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"k8s.io/klog/v2"
)

// notifyChannel carries cross-replica watch nudges. The payload is the resource
// kind only: receivers relist from the resources table, so a lost notification
// costs latency (bounded by the broadcaster's periodic relist), never data.
const notifyChannel = "ark_resource_change"

// StartNotifyListener starts the LISTEN loop that turns cross-replica write
// notifications into broadcaster nudges. Unlike the WAL consumer it is not
// leader-gated: NOTIFY fans out to every listening session, so each replica
// runs its own. Repeated calls are no-ops.
func (p *PostgreSQLBackend) StartNotifyListener() {
	p.notifyOnce.Do(func() {
		go p.startNotifyListener()
	})
}

func (p *PostgreSQLBackend) startNotifyListener() {
	backoff := time.Second
	maxBackoff := 30 * time.Second

	for {
		select {
		case <-p.ctx.Done():
			return
		default:
		}

		err := p.runNotifyListener()
		if p.ctx.Err() != nil {
			return
		}

		klog.Errorf("notify listener disconnected, retrying in %v: %v", backoff, err)
		notifyListenerReconnectsTotal.Inc()
		select {
		case <-p.ctx.Done():
			return
		case <-time.After(backoff):
		}
		backoff = min(backoff*2, maxBackoff)
	}
}

func (p *PostgreSQLBackend) runNotifyListener() error {
	cfg, err := pgconn.ParseConfig(p.connStr)
	if err != nil {
		return fmt.Errorf("parse config: %w", err)
	}
	cfg.OnNotification = func(_ *pgconn.PgConn, n *pgconn.Notification) {
		p.handleNotification(n.Payload)
	}

	conn, err := pgconn.ConnectConfig(p.ctx, cfg)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer func() { _ = conn.Close(p.ctx) }()

	if _, err := conn.Exec(p.ctx, "LISTEN "+notifyChannel).ReadAll(); err != nil {
		return fmt.Errorf("listen: %w", err)
	}

	notifyListenerConnected.Set(1)
	defer notifyListenerConnected.Set(0)

	klog.Infof("notify listener started on channel %s", notifyChannel)
	p.nudgeAllWatchers()

	for {
		if err := conn.WaitForNotification(p.ctx); err != nil {
			return fmt.Errorf("wait for notification: %w", err)
		}
	}
}

func (p *PostgreSQLBackend) handleNotification(kind string) {
	if kind == "" {
		return
	}
	notifyReceivedTotal.WithLabelValues(kind).Inc()
	p.nudgeKind(kind)
}
