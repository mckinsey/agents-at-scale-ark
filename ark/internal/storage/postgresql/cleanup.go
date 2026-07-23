/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"k8s.io/klog/v2"
)

var cleanupRetryInterval = 3 * time.Second

func cleanupConnString(cfg Config) string {
	if cfg.SSLMode == "" {
		cfg.SSLMode = "require"
	}
	if cfg.Port == 0 {
		cfg.Port = 5432
	}
	return buildConnString(cfg) + " connect_timeout=10"
}

// DropReplicationArtifacts removes the logical replication slot and publication
// created by the backend. Without this, an uninstalled deployment leaves an
// inactive slot behind that pins WAL segments until the disk fills up.
//
// A still-terminating apiserver pod can hold the slot active or recreate it
// right after a drop (the WAL consumer reconnects and re-creates the slot), so
// the drop is retried until it outlasts the pod's termination grace period.
func DropReplicationArtifacts(ctx context.Context, cfg Config) error {
	db, err := sql.Open("postgres", cleanupConnString(cfg))
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer func() { _ = db.Close() }()
	return dropReplicationArtifacts(ctx, db)
}

func dropReplicationArtifacts(ctx context.Context, db *sql.DB) error {
	for {
		if _, err := db.ExecContext(ctx,
			"SELECT pg_terminate_backend(active_pid) FROM pg_replication_slots WHERE slot_name = $1 AND active_pid IS NOT NULL",
			walSlotName); err != nil {
			return fmt.Errorf("terminate slot consumer: %w", err)
		}

		_, dropErr := db.ExecContext(ctx,
			"SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = $1",
			walSlotName)
		var stillPresent bool
		if dropErr == nil {
			var n int
			if err := db.QueryRowContext(ctx,
				"SELECT count(*) FROM pg_replication_slots WHERE slot_name = $1",
				walSlotName).Scan(&n); err != nil {
				return fmt.Errorf("verify slot dropped: %w", err)
			}
			stillPresent = n > 0
		}
		if dropErr == nil && !stillPresent {
			break
		}

		reason := fmt.Sprintf("slot %s was recreated by a live consumer", walSlotName)
		if dropErr != nil {
			reason = dropErr.Error()
		}
		klog.Infof("replication slot busy, retrying: %s", reason)
		select {
		case <-ctx.Done():
			return fmt.Errorf("drop replication slot (%s): %w", reason, ctx.Err())
		case <-time.After(cleanupRetryInterval):
		}
	}

	if _, err := db.ExecContext(ctx, "DROP PUBLICATION IF EXISTS "+walPublicationName); err != nil {
		return fmt.Errorf("drop publication: %w", err)
	}

	klog.Infof("dropped replication slot and publication %s", walSlotName)
	return nil
}
