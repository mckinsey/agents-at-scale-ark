package queue

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type QueueClient struct {
	riverClient *river.Client[pgx.Tx]
	db          *pgxpool.Pool
}

type QueueConfig struct {
	PostgresURL  string
	WorkerCount  int
	PollInterval time.Duration
}

type JobStatus struct {
	State      string
	AttemptNum int
	MaxAttempts int
	Errors     []string
	CreatedAt  time.Time
	FinalizedAt *time.Time
}

func NewQueueClient(ctx context.Context, config QueueConfig, workers *river.Workers) (*QueueClient, error) {
	dbPool, err := pgxpool.New(ctx, config.PostgresURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to postgres: %w", err)
	}

	if err := dbPool.Ping(ctx); err != nil {
		dbPool.Close()
		return nil, fmt.Errorf("failed to ping postgres: %w", err)
	}

	migrator, err := rivermigrate.New(riverpgxv5.New(dbPool), nil)
	if err != nil {
		dbPool.Close()
		return nil, fmt.Errorf("failed to create migrator: %w", err)
	}

	_, err = migrator.Migrate(ctx, rivermigrate.DirectionUp, &rivermigrate.MigrateOpts{})
	if err != nil {
		dbPool.Close()
		return nil, fmt.Errorf("failed to run river migrations: %w", err)
	}

	riverClient, err := river.NewClient(riverpgxv5.New(dbPool), &river.Config{
		Queues: map[string]river.QueueConfig{
			river.QueueDefault: {MaxWorkers: config.WorkerCount},
		},
		Workers: workers,
	})
	if err != nil {
		dbPool.Close()
		return nil, fmt.Errorf("failed to create river client: %w", err)
	}

	return &QueueClient{
		riverClient: riverClient,
		db:          dbPool,
	}, nil
}

func (c *QueueClient) Start(ctx context.Context) error {
	if err := c.riverClient.Start(ctx); err != nil {
		return fmt.Errorf("failed to start river client: %w", err)
	}
	return nil
}

func (c *QueueClient) Stop(ctx context.Context) error {
	if err := c.riverClient.Stop(ctx); err != nil {
		return fmt.Errorf("failed to stop river client: %w", err)
	}
	return nil
}

func (c *QueueClient) Close() {
	c.db.Close()
}

func (c *QueueClient) EnqueueQuery(ctx context.Context, query *arkv1alpha1.Query) (int64, error) {
	job := QueryExecutionJob{
		QueryName:      query.Name,
		QueryNamespace: query.Namespace,
		QueryUID:       string(query.UID),
	}

	insertRes, err := c.riverClient.Insert(ctx, &job, &river.InsertOpts{
		MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
		},
		Tags: []string{"query", query.Namespace, query.Name},
	})
	if err != nil {
		return 0, fmt.Errorf("failed to enqueue query: %w", err)
	}

	return insertRes.Job.ID, nil
}

func (c *QueueClient) CancelQuery(ctx context.Context, queryUID string) error {
	query := `
		SELECT id FROM river_job
		WHERE kind = 'QueryExecutionJob'
		AND args->>'QueryUID' = $1
		AND state IN ('available', 'running', 'scheduled', 'retryable')
		ORDER BY id DESC
		LIMIT 1
	`

	var jobID int64
	err := c.db.QueryRow(ctx, query, queryUID).Scan(&jobID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("failed to find job: %w", err)
	}

	_, err = c.riverClient.JobCancel(ctx, jobID)
	if err != nil {
		return fmt.Errorf("failed to cancel job: %w", err)
	}

	return nil
}

func (c *QueueClient) GetJobStatus(ctx context.Context, queryUID string) (*JobStatus, error) {
	query := `
		SELECT state, attempt, max_attempts, errors, created_at, finalized_at
		FROM river_job
		WHERE kind = 'QueryExecutionJob'
		AND args->>'QueryUID' = $1
		ORDER BY id DESC
		LIMIT 1
	`

	var status JobStatus
	var errorsJSON []byte
	err := c.db.QueryRow(ctx, query, queryUID).Scan(
		&status.State,
		&status.AttemptNum,
		&status.MaxAttempts,
		&errorsJSON,
		&status.CreatedAt,
		&status.FinalizedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get job status: %w", err)
	}

	return &status, nil
}

func (c *QueueClient) JobExists(ctx context.Context, queryUID string) (bool, error) {
	query := `
		SELECT EXISTS(
			SELECT 1 FROM river_job
			WHERE kind = 'QueryExecutionJob'
			AND args->>'QueryUID' = $1
			AND state IN ('available', 'running', 'scheduled', 'retryable')
		)
	`

	var exists bool
	err := c.db.QueryRow(ctx, query, queryUID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check job existence: %w", err)
	}

	return exists, nil
}
