package store

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var validTableName = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

func init() {
	Register("postgres", func(cfg any) (Store, error) {
		c := cfg.(*PostgresConfig)
		return NewPostgres(c)
	})
}

type PostgresConfig struct {
	DSN       string
	TableName string
	PoolSize  int
}

type postgresStore struct {
	pool      *pgxpool.Pool
	tableName string
}

func NewPostgres(cfg *PostgresConfig) (Store, error) {
	if !validTableName.MatchString(cfg.TableName) {
		return nil, fmt.Errorf("invalid table name: must match [a-zA-Z_][a-zA-Z0-9_]*")
	}

	poolCfg, err := pgxpool.ParseConfig(cfg.DSN)
	if err != nil {
		return nil, err
	}
	poolCfg.MaxConns = int32(cfg.PoolSize)

	pool, err := pgxpool.NewWithConfig(context.Background(), poolCfg)
	if err != nil {
		return nil, err
	}
	return &postgresStore{pool: pool, tableName: cfg.TableName}, nil
}

func (s *postgresStore) Name() string { return "postgres" }

func (s *postgresStore) Get(ctx context.Context, key string) (*KV, error) {
	var kv KV
	err := s.pool.QueryRow(ctx,
		`SELECT key, value, version, created_at, updated_at FROM `+s.tableName+` WHERE key = $1`, key).
		Scan(&kv.Key, &kv.Value, &kv.Version, &kv.CreatedAt, &kv.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &kv, nil
}

func (s *postgresStore) Put(ctx context.Context, key string, value []byte) error {
	now := time.Now().UnixNano()
	_, err := s.pool.Exec(ctx,
		`INSERT INTO `+s.tableName+` (key, value, version, created_at, updated_at)
		 VALUES ($1, $2, 1, $3, $3)
		 ON CONFLICT (key) DO UPDATE SET
		   value = EXCLUDED.value,
		   version = `+s.tableName+`.version + 1,
		   updated_at = EXCLUDED.updated_at`,
		key, value, now)
	return err
}

func (s *postgresStore) Delete(ctx context.Context, key string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM `+s.tableName+` WHERE key = $1`, key)
	return err
}

func (s *postgresStore) BatchGet(ctx context.Context, keys []string) ([]*KV, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT key, value, version, created_at, updated_at FROM `+s.tableName+` WHERE key = ANY($1)`, keys)
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

func (s *postgresStore) BatchPut(ctx context.Context, kvs []KV) error {
	batch := &pgx.Batch{}
	now := time.Now().UnixNano()
	for _, kv := range kvs {
		batch.Queue(
			`INSERT INTO `+s.tableName+` (key, value, version, created_at, updated_at)
			 VALUES ($1, $2, 1, $3, $3)
			 ON CONFLICT (key) DO UPDATE SET
			   value = EXCLUDED.value,
			   version = `+s.tableName+`.version + 1,
			   updated_at = EXCLUDED.updated_at`,
			kv.Key, kv.Value, now)
	}
	br := s.pool.SendBatch(ctx, batch)
	defer br.Close()

	for range kvs {
		if _, err := br.Exec(); err != nil {
			return err
		}
	}
	return nil
}

func (s *postgresStore) List(ctx context.Context, prefix string, limit int) ([]*KV, error) {
	query := `SELECT key, value, version, created_at, updated_at FROM ` + s.tableName + ` WHERE key LIKE $1`
	args := []any{prefix + "%"}
	if limit > 0 {
		query += ` LIMIT $2`
		args = append(args, limit)
	}

	rows, err := s.pool.Query(ctx, query, args...)
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

func (s *postgresStore) Watch(ctx context.Context, prefix string) (<-chan WatchEvent, error) {
	ch := make(chan WatchEvent, 100)

	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}

	_, err = conn.Exec(ctx, `LISTEN kv_changes`)
	if err != nil {
		conn.Release()
		return nil, err
	}

	go func() {
		defer close(ch)
		defer conn.Release()

		for {
			notification, err := conn.Conn().WaitForNotification(ctx)
			if err != nil {
				return
			}
			receiveTime := time.Now()

			parts := strings.SplitN(notification.Payload, ":", 2)
			if len(parts) != 2 {
				continue
			}
			if !strings.HasPrefix(parts[1], prefix) {
				continue
			}

			event := WatchEvent{KV: KV{Key: parts[1]}}
			if parts[0] == "DELETE" {
				event.Type = EventDelete
			} else {
				kv, _ := s.Get(ctx, parts[1])
				if kv != nil {
					event.KV = *kv
				}
			}
			event.Latency = time.Since(receiveTime)
			ch <- event
		}
	}()

	return ch, nil
}

func (s *postgresStore) Setup(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS `+s.tableName+` (
			key TEXT PRIMARY KEY,
			value BYTEA,
			version BIGINT DEFAULT 1,
			created_at BIGINT,
			updated_at BIGINT
		);
		CREATE INDEX IF NOT EXISTS idx_`+s.tableName+`_prefix ON `+s.tableName+` (key text_pattern_ops);

		CREATE OR REPLACE FUNCTION notify_kv_change() RETURNS TRIGGER AS $$
		BEGIN
			IF TG_OP = 'DELETE' THEN
				PERFORM pg_notify('kv_changes', 'DELETE:' || OLD.key);
				RETURN OLD;
			ELSE
				PERFORM pg_notify('kv_changes', 'PUT:' || NEW.key);
				RETURN NEW;
			END IF;
		END;
		$$ LANGUAGE plpgsql;

		DROP TRIGGER IF EXISTS kv_change_trigger ON `+s.tableName+`;
		CREATE TRIGGER kv_change_trigger
			AFTER INSERT OR UPDATE OR DELETE ON `+s.tableName+`
			FOR EACH ROW EXECUTE FUNCTION notify_kv_change();
	`)
	return err
}

func (s *postgresStore) Teardown(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `DROP TABLE IF EXISTS `+s.tableName+` CASCADE`)
	return err
}

func (s *postgresStore) Close() error {
	s.pool.Close()
	return nil
}
