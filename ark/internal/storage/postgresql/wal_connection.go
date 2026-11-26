/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math"
	"os"
	"strings"
	"time"

	"github.com/jackc/pglogrepl"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgproto3"
	"k8s.io/klog/v2"
)

func (p *PostgreSQLBackend) startWALConsumer(ctx context.Context) {
	walConsumerActive.Set(1)
	defer walConsumerActive.Set(0)
	defer walLastMessageTimestamp.Set(math.NaN())

	backoff := time.Second
	maxBackoff := 30 * time.Second

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		err := p.runWALConsumer(ctx)
		if ctx.Err() != nil {
			return
		}

		klog.Errorf("WAL consumer disconnected, retrying in %v: %v", backoff, err)
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		backoff = min(backoff*2, maxBackoff)
	}
}

func (p *PostgreSQLBackend) runWALConsumer(ctx context.Context) error {
	cfg, err := pgconn.ParseConfig(p.connStr)
	if err != nil {
		return fmt.Errorf("parse config: %w", err)
	}
	cfg.RuntimeParams["replication"] = "database"

	conn, err := pgconn.ConnectConfig(ctx, cfg)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer func() { _ = conn.Close(ctx) }()

	hostname, _ := os.Hostname()
	slotName := replicaSlotName(hostname)
	startLSN, err := p.createTemporarySlot(ctx, conn, slotName)
	if err != nil {
		return err
	}
	p.slotName.Store(slotName)
	defer p.slotName.Store("")
	p.dropLegacySlot(ctx)

	err = pglogrepl.StartReplication(ctx, conn, slotName, startLSN, pglogrepl.StartReplicationOptions{
		PluginArgs: []string{
			"proto_version '1'",
			fmt.Sprintf("publication_names '%s'", walPublicationName),
		},
	})
	if err != nil {
		return fmt.Errorf("start replication: %w", err)
	}

	klog.Infof("WAL consumer started from LSN %s", startLSN)
	p.nudgeAllWatchers()

	return p.streamWAL(ctx, conn, startLSN)
}

func (p *PostgreSQLBackend) streamWAL(ctx context.Context, conn *pgconn.PgConn, resumeLSN pglogrepl.LSN) error {
	state := newWALStreamState(resumeLSN)

	for {
		if ctx.Err() != nil {
			return nil
		}

		rawMsg, err := p.receiveWALMessage(ctx, conn, state)
		if err != nil {
			return err
		}
		if rawMsg == nil {
			continue
		}

		if err := p.handleWALMessage(ctx, conn, rawMsg, state); err != nil {
			return err
		}

		if time.Since(state.lastStatusUpdate) > walKeepaliveInterval {
			if err := p.sendStandbyStatus(ctx, conn, state.ackLSN()); err != nil {
				return fmt.Errorf("periodic standby status: %w", err)
			}
			state.lastStatusUpdate = time.Now()
		}
	}
}

func (p *PostgreSQLBackend) receiveWALMessage(ctx context.Context, conn *pgconn.PgConn, state *walStreamState) (pgproto3.BackendMessage, error) {
	deadline := time.Now().Add(walStandbyTimeout)
	recvCtx, cancel := context.WithDeadline(ctx, deadline)
	rawMsg, err := conn.ReceiveMessage(recvCtx)
	cancel()

	if err == nil {
		return rawMsg, nil
	}
	if ctx.Err() != nil {
		return nil, nil
	}
	if pgconn.Timeout(err) {
		if err := p.sendStandbyStatus(ctx, conn, state.ackLSN()); err != nil {
			return nil, fmt.Errorf("standby status: %w", err)
		}
		state.lastStatusUpdate = time.Now()
		return nil, nil
	}
	return nil, fmt.Errorf("receive message: %w", err)
}

const maxSlotNameLength = 63

func replicaSlotName(hostname string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(hostname) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	suffix := make([]byte, 4)
	_, _ = rand.Read(suffix)
	tail := "_" + hex.EncodeToString(suffix)
	prefix := walSlotName + "_"
	host := b.String()
	if room := maxSlotNameLength - len(prefix) - len(tail); len(host) > room {
		host = host[:room]
	}
	return prefix + host + tail
}

func (p *PostgreSQLBackend) currentSlotName() string {
	name, _ := p.slotName.Load().(string)
	return name
}

// createTemporarySlot creates a replication slot that Postgres drops when the
// connection closes, so a replica that dies never leaves a slot pinning WAL.
// Notifications are only nudges and every new stream relists all kinds, so
// nothing needs to survive a reconnect.
func (p *PostgreSQLBackend) createTemporarySlot(ctx context.Context, conn *pgconn.PgConn, slotName string) (pglogrepl.LSN, error) {
	res, err := pglogrepl.CreateReplicationSlot(ctx, conn, slotName, "pgoutput",
		pglogrepl.CreateReplicationSlotOptions{Temporary: true})
	if err != nil {
		return 0, fmt.Errorf("create replication slot: %w", err)
	}
	lsn, err := pglogrepl.ParseLSN(res.ConsistentPoint)
	if err != nil {
		return 0, fmt.Errorf("parse LSN: %w", err)
	}
	klog.Infof("Created temporary replication slot %s at %s", slotName, lsn)
	return lsn, nil
}

// dropLegacySlot removes the persistent ark_cdc slot left by earlier versions.
// With no consumer it would pin WAL until the disk fills. It is skipped while an
// older replica still holds it active, and retried by the cleanup loop.
func (p *PostgreSQLBackend) dropLegacySlot(ctx context.Context) {
	res, err := p.db.ExecContext(ctx,
		`SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = $1 AND NOT active`,
		walSlotName)
	if err != nil {
		klog.Warningf("drop legacy replication slot %s: %v", walSlotName, err)
		return
	}
	if n, _ := res.RowsAffected(); n > 0 {
		klog.Infof("Dropped legacy replication slot %s", walSlotName)
	}
}

func (p *PostgreSQLBackend) sendStandbyStatus(ctx context.Context, conn *pgconn.PgConn, lsn pglogrepl.LSN) error {
	return pglogrepl.SendStandbyStatusUpdate(ctx, conn, pglogrepl.StandbyStatusUpdate{
		WALWritePosition: lsn,
		WALFlushPosition: lsn,
		WALApplyPosition: lsn,
	})
}
