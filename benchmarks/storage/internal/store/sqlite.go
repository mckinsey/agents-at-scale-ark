package store

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

var validSyncModes = map[string]bool{
	"OFF": true, "NORMAL": true, "FULL": true, "EXTRA": true,
	"off": true, "normal": true, "full": true, "extra": true,
	"0": true, "1": true, "2": true, "3": true,
}

func init() {
	Register("sqlite", func(cfg any) (Store, error) {
		c := cfg.(*SQLiteConfig)
		return NewSQLite(c)
	})
}

type SQLiteConfig struct {
	Path     string
	WALMode  bool
	SyncMode string
}

type sqliteStore struct {
	db        *sql.DB
	mu        sync.RWMutex
	watchers  []chan WatchEvent
	watcherMu sync.Mutex
}

func NewSQLite(cfg *SQLiteConfig) (Store, error) {
	if strings.Contains(cfg.Path, "..") {
		return nil, fmt.Errorf("invalid path: must not contain '..'")
	}
	absPath, err := filepath.Abs(cfg.Path)
	if err != nil {
		return nil, fmt.Errorf("invalid path: %w", err)
	}

	if cfg.SyncMode != "" && !validSyncModes[cfg.SyncMode] {
		return nil, fmt.Errorf("invalid sync mode: must be OFF, NORMAL, FULL, or EXTRA")
	}

	dsn := absPath + "?"
	if cfg.WALMode {
		dsn += "_journal_mode=WAL&"
	}
	if cfg.SyncMode != "" {
		dsn += "_synchronous=" + cfg.SyncMode + "&"
	}
	dsn += "_busy_timeout=5000"

	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	return &sqliteStore{db: db}, nil
}

func (s *sqliteStore) Name() string { return "sqlite" }

func (s *sqliteStore) Get(ctx context.Context, key string) (*KV, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var kv KV
	err := s.db.QueryRowContext(ctx,
		`SELECT key, value, version, created_at, updated_at FROM kv WHERE key = ?`, key).
		Scan(&kv.Key, &kv.Value, &kv.Version, &kv.CreatedAt, &kv.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &kv, nil
}

func (s *sqliteStore) Put(ctx context.Context, key string, value []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UnixNano()
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO kv (key, value, version, created_at, updated_at)
		 VALUES (?, ?, 1, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET
		   value = excluded.value,
		   version = version + 1,
		   updated_at = excluded.updated_at`,
		key, value, now, now)

	if err == nil {
		s.notify(WatchEvent{Type: EventPut, KV: KV{Key: key, Value: value}})
	}
	return err
}

func (s *sqliteStore) Delete(ctx context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.ExecContext(ctx, `DELETE FROM kv WHERE key = ?`, key)
	if err == nil {
		s.notify(WatchEvent{Type: EventDelete, KV: KV{Key: key}})
	}
	return err
}

func (s *sqliteStore) BatchGet(ctx context.Context, keys []string) ([]*KV, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	args := make([]any, len(keys))
	placeholders := make([]string, len(keys))
	for i, k := range keys {
		args[i] = k
		placeholders[i] = "?"
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT key, value, version, created_at, updated_at FROM kv
		 WHERE key IN (`+strings.Join(placeholders, ",")+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*KV
	for rows.Next() {
		var kv KV
		if err := rows.Scan(&kv.Key, &kv.Value, &kv.Version, &kv.CreatedAt, &kv.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, &kv)
	}
	return result, rows.Err()
}

func (s *sqliteStore) BatchPut(ctx context.Context, kvs []KV) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx,
		`INSERT INTO kv (key, value, version, created_at, updated_at)
		 VALUES (?, ?, 1, ?, ?)
		 ON CONFLICT(key) DO UPDATE SET
		   value = excluded.value,
		   version = version + 1,
		   updated_at = excluded.updated_at`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	now := time.Now().UnixNano()
	for _, kv := range kvs {
		if _, err := stmt.ExecContext(ctx, kv.Key, kv.Value, now, now); err != nil {
			return err
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	for _, kv := range kvs {
		s.notify(WatchEvent{Type: EventPut, KV: kv})
	}
	return nil
}

func (s *sqliteStore) List(ctx context.Context, prefix string, limit int) ([]*KV, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := `SELECT key, value, version, created_at, updated_at FROM kv WHERE key LIKE ?`
	args := []any{prefix + "%"}
	if limit > 0 {
		query += ` LIMIT ?`
		args = append(args, limit)
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*KV
	for rows.Next() {
		var kv KV
		if err := rows.Scan(&kv.Key, &kv.Value, &kv.Version, &kv.CreatedAt, &kv.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, &kv)
	}
	return result, rows.Err()
}

func (s *sqliteStore) Watch(ctx context.Context, prefix string) (<-chan WatchEvent, error) {
	ch := make(chan WatchEvent, 100)

	s.watcherMu.Lock()
	s.watchers = append(s.watchers, ch)
	s.watcherMu.Unlock()

	go func() {
		<-ctx.Done()
		s.watcherMu.Lock()
		for i, w := range s.watchers {
			if w == ch {
				s.watchers = append(s.watchers[:i], s.watchers[i+1:]...)
				break
			}
		}
		s.watcherMu.Unlock()
		close(ch)
	}()

	return ch, nil
}

func (s *sqliteStore) notify(event WatchEvent) {
	s.watcherMu.Lock()
	defer s.watcherMu.Unlock()

	for _, ch := range s.watchers {
		select {
		case ch <- event:
		default:
		}
	}
}

func (s *sqliteStore) Setup(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS kv (
			key TEXT PRIMARY KEY,
			value BLOB,
			version INTEGER DEFAULT 1,
			created_at INTEGER,
			updated_at INTEGER
		);
		CREATE INDEX IF NOT EXISTS idx_kv_prefix ON kv (key);
	`)
	return err
}

func (s *sqliteStore) Teardown(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM kv`)
	return err
}

func (s *sqliteStore) Close() error {
	return s.db.Close()
}
