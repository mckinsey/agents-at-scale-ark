package queryworker

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
)

const (
	QueueName         = "ark_queries"
	DefaultMaxWorkers = 10
)

type RiverClient = river.Client[pgx.Tx]

type SetupResult struct {
	Client *RiverClient
	Pool   *pgxpool.Pool
}

func Setup(ctx context.Context, executor QueryExecutor) (*SetupResult, error) {
	connString := buildConnString()

	pool, err := pgxpool.New(ctx, connString)
	if err != nil {
		return nil, fmt.Errorf("failed to create pgx pool: %w", err)
	}

	if err := runMigrations(ctx, pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to run river migrations: %w", err)
	}

	maxWorkers := DefaultMaxWorkers
	if v := os.Getenv("ARK_QUERY_WORKERS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxWorkers = n
		}
	}

	workers := river.NewWorkers()
	river.AddWorker(workers, &QueryJobWorker{Executor: executor})

	client, err := river.NewClient(riverpgxv5.New(pool), &river.Config{
		Queues: map[string]river.QueueConfig{
			QueueName: {MaxWorkers: maxWorkers},
		},
		Workers: workers,
	})
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to create river client: %w", err)
	}

	return &SetupResult{Client: client, Pool: pool}, nil
}

func buildConnString() string {
	host := envOrDefault("ARK_POSTGRES_HOST", "localhost")
	port := envOrDefault("ARK_POSTGRES_PORT", "5432")
	db := envOrDefault("ARK_POSTGRES_DATABASE", "ark")
	user := envOrDefault("ARK_POSTGRES_USER", "ark")
	pass := os.Getenv("ARK_POSTGRES_PASSWORD")
	sslMode := envOrDefault("ARK_POSTGRES_SSL_MODE", "disable")

	u := &url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(user, pass),
		Host:     fmt.Sprintf("%s:%s", host, port),
		Path:     db,
		RawQuery: fmt.Sprintf("sslmode=%s", url.QueryEscape(sslMode)),
	}
	return u.String()
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func runMigrations(ctx context.Context, pool *pgxpool.Pool) error {
	migrator, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		return err
	}
	_, err = migrator.Migrate(ctx, rivermigrate.DirectionUp, nil)
	return err
}
