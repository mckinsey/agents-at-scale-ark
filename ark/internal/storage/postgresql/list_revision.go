/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"

	"mckinsey.com/ark/internal/storage"
)

type queryer interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

type listPage struct {
	objects          []runtime.Object
	resourceVersions []int64
	snapshot         string
	maxRV            int64
}

func checkListRevision(head int64, rev storage.ListRevision) error {
	if rev.RV == 0 {
		return nil
	}
	if head < 0 || uint64(head) < rev.RV {
		return storage.NewTooLargeResourceVersionError(rev.RV, head)
	}
	if rev.Exact && uint64(head) > rev.RV {
		return fmt.Errorf("%w: resourceVersion %d is below the store head %d; exact reads are served only at the current head", storage.ErrResourceExpired, rev.RV, head)
	}
	return nil
}

// freshHead turns a MAX(resource_version) reading into the store head revision: it is
// lifted to the purge floor and the head revision base. The floor term recovers the
// head when the highest-RV row has itself been purged (e.g. the newest object was
// deleted and its tombstone hard-deleted), where a plain MAX over surviving rows would
// fall back below the floor and 410 every resume. A watch resuming from it is at or
// above the floor yet never skips a committed change: the floor is at most the true
// head, and the base is above every write because bootstrapHeadRevisionQuery burns its
// value. When the result is still below want, the floor is re-read first, since another
// replica may have raised it within the last refresh interval.
func (p *PostgreSQLBackend) freshHead(ctx context.Context, maxRV int64, want uint64) int64 {
	if head := p.liftHead(maxRV); head >= 0 && uint64(head) >= want {
		return head
	}
	p.refreshPurgeFloorContext(ctx)
	return p.liftHead(maxRV)
}

func (p *PostgreSQLBackend) RequireResourceVersion(ctx context.Context, minRV uint64) error {
	if minRV == 0 {
		return nil
	}
	var maxRV sql.NullInt64
	if err := p.db.QueryRowContext(ctx, maxResourceVersionQuery).Scan(&maxRV); err != nil {
		return fmt.Errorf("failed to read the store head: %w", err)
	}
	head := p.freshHead(ctx, maxRV.Int64, minRV)
	if uint64(head) < minRV {
		return storage.NewTooLargeResourceVersionError(minRV, head)
	}
	return nil
}

func (p *PostgreSQLBackend) readListPage(ctx context.Context, kind, namespace string, opts storage.ListOptions, contTok listContinueToken) (listPage, error) {
	query, args, err := p.buildListQuery(kind, namespace, opts, contTok)
	if err != nil {
		return listPage{}, err
	}

	if contTok.Snapshot != "" {
		page, err := p.scanListPage(ctx, p.db, query, args, kind, false)
		if err != nil {
			return listPage{}, err
		}
		page.snapshot = contTok.Snapshot
		page.maxRV = contTok.HeadRV
		if page.maxRV == 0 {
			page.maxRV, err = snapshotMaxResourceVersion(ctx, p.db, page.snapshot)
		}
		return page, err
	}

	tx, err := p.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return listPage{}, fmt.Errorf("failed to begin list transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	page, err := p.scanListPage(ctx, tx, query, args, kind, true)
	if err != nil {
		return listPage{}, err
	}
	if page.snapshot == "" {
		if err := tx.QueryRowContext(ctx, "SELECT pg_current_snapshot()::text").Scan(&page.snapshot); err != nil {
			return listPage{}, fmt.Errorf("failed to capture pg_current_snapshot: %w", err)
		}
	}
	if page.maxRV, err = snapshotMaxResourceVersion(ctx, tx, page.snapshot); err != nil {
		return listPage{}, err
	}
	if err := tx.Commit(); err != nil {
		return listPage{}, fmt.Errorf("failed to commit list transaction: %w", err)
	}
	return page, nil
}

func (p *PostgreSQLBackend) scanListPage(ctx context.Context, q queryer, query string, args []interface{}, kind string, firstPage bool) (listPage, error) {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return listPage{}, fmt.Errorf("failed to query resources: %w", err)
	}
	defer func() { _ = rows.Close() }()

	objects, resourceVersions, snapshot, err := p.scanListRows(rows, kind, firstPage)
	if err != nil {
		return listPage{}, err
	}
	if err := rows.Err(); err != nil {
		return listPage{}, fmt.Errorf("failed to read resources: %w", err)
	}
	if err := rows.Close(); err != nil {
		return listPage{}, fmt.Errorf("failed to close resource rows: %w", err)
	}
	return listPage{objects: objects, resourceVersions: resourceVersions, snapshot: snapshot}, nil
}
