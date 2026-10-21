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
	headRV           int64
}

func checkListRevision(head int64, rev storage.ListRevision) error {
	if rev.RV == 0 {
		return nil
	}
	if head < 0 || uint64(head) < rev.RV {
		return &storage.TooLargeResourceVersionError{Requested: rev.RV, Current: head}
	}
	if rev.Exact && uint64(head) > rev.RV {
		return fmt.Errorf("%w: resourceVersion %d is below the store head %d; exact reads are served only at the current head", storage.ErrResourceExpired, rev.RV, head)
	}
	return nil
}

func (p *PostgreSQLBackend) liftHeadFresh(ctx context.Context, head int64, want uint64) int64 {
	if head >= 0 && uint64(head) >= want {
		return head
	}
	p.refreshPurgeFloorContext(ctx)
	return p.liftHead(head)
}

func (p *PostgreSQLBackend) RequireResourceVersion(ctx context.Context, minRV uint64) error {
	if minRV == 0 {
		return nil
	}
	var maxRV sql.NullInt64
	if err := p.db.QueryRowContext(ctx, maxResourceVersionQuery).Scan(&maxRV); err != nil {
		return fmt.Errorf("failed to read the store head: %w", err)
	}
	head := p.liftHeadFresh(ctx, p.liftHead(maxRV.Int64), minRV)
	if uint64(head) < minRV {
		return &storage.TooLargeResourceVersionError{Requested: minRV, Current: head}
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
		page.headRV = contTok.HeadRV
		if page.headRV == 0 {
			page.headRV, err = p.headResourceVersion(ctx, p.db, page.snapshot)
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
	if page.headRV, err = p.headResourceVersion(ctx, tx, page.snapshot); err != nil {
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
