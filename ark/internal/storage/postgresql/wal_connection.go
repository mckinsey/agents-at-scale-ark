/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pglogrepl"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgproto3"
	"k8s.io/klog/v2"
)

func (p *PostgreSQLBackend) startWALConsumer() {
	backoff := time.Second
	maxBackoff := 30 * time.Second
	slotName := generateSlotName()

	for {
		select {
		case <-p.ctx.Done():
			return
		default:
		}

		err := p.runWALConsumer(slotName)
		if p.ctx.Err() != nil {
			return
		}

		klog.Errorf("WAL consumer disconnected, retrying in %v: %v", backoff, err)
		select {
		case <-p.ctx.Done():
			return
		case <-time.After(backoff):
		}
		backoff = min(backoff*2, maxBackoff)
	}
}

func (p *PostgreSQLBackend) runWALConsumer(slotName string) error {
	cfg, err := pgconn.ParseConfig(p.connStr)
	if err != nil {
		return fmt.Errorf("parse config: %w", err)
	}
	cfg.RuntimeParams["replication"] = "database"

	conn, err := pgconn.ConnectConfig(p.ctx, cfg)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer func() { _ = conn.Close(p.ctx) }()

	startLSN, err := p.ensureReplicationSlot(conn, slotName)
	if err != nil {
		return fmt.Errorf("ensure slot: %w", err)
	}

	err = pglogrepl.StartReplication(p.ctx, conn, slotName, startLSN, pglogrepl.StartReplicationOptions{
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

	return p.streamWAL(conn)
}

func (p *PostgreSQLBackend) streamWAL(conn *pgconn.PgConn) error {
	state := &walStreamState{
		relations:        make(map[uint32]*pglogrepl.RelationMessage),
		lastStatusUpdate: time.Now(),
	}

	for {
		if p.ctx.Err() != nil {
			return nil
		}

		rawMsg, err := p.receiveWALMessage(conn, state)
		if err != nil {
			return err
		}
		if rawMsg == nil {
			continue
		}

		if err := p.handleWALMessage(conn, rawMsg, state); err != nil {
			return err
		}

		if time.Since(state.lastStatusUpdate) > walKeepaliveInterval {
			if err := p.sendStandbyStatus(conn, state.lastWriteLSN); err != nil {
				return fmt.Errorf("periodic standby status: %w", err)
			}
			state.lastStatusUpdate = time.Now()
		}
	}
}

func (p *PostgreSQLBackend) receiveWALMessage(conn *pgconn.PgConn, state *walStreamState) (pgproto3.BackendMessage, error) {
	deadline := time.Now().Add(walStandbyTimeout)
	ctx, cancel := context.WithDeadline(p.ctx, deadline)
	rawMsg, err := conn.ReceiveMessage(ctx)
	cancel()

	if err == nil {
		return rawMsg, nil
	}
	if p.ctx.Err() != nil {
		return nil, nil
	}
	if pgconn.Timeout(err) {
		if err := p.sendStandbyStatus(conn, state.lastWriteLSN); err != nil {
			return nil, fmt.Errorf("standby status: %w", err)
		}
		state.lastStatusUpdate = time.Now()
		return nil, nil
	}
	return nil, fmt.Errorf("receive message: %w", err)
}

func (p *PostgreSQLBackend) ensureReplicationSlot(conn *pgconn.PgConn, slotName string) (pglogrepl.LSN, error) {
	res, err := pglogrepl.CreateReplicationSlot(p.ctx, conn, slotName, "pgoutput",
		pglogrepl.CreateReplicationSlotOptions{Temporary: true})
	if err != nil {
		return 0, err
	}
	klog.Infof("Created replication slot %s at %s", slotName, res.ConsistentPoint)
	lsn, err := pglogrepl.ParseLSN(res.ConsistentPoint)
	if err != nil {
		return 0, fmt.Errorf("parse LSN: %w", err)
	}
	return lsn, nil
}

func (p *PostgreSQLBackend) sendStandbyStatus(conn *pgconn.PgConn, lsn pglogrepl.LSN) error {
	return pglogrepl.SendStandbyStatusUpdate(p.ctx, conn, pglogrepl.StandbyStatusUpdate{
		WALWritePosition: lsn,
		WALFlushPosition: lsn,
		WALApplyPosition: lsn,
	})
}
