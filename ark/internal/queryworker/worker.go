package queryworker

import (
	"context"
	"time"

	"github.com/riverqueue/river"
)

type QueryExecutor interface {
	ExecuteQueryDirect(ctx context.Context, namespace, name string) error
}

type QueryJobWorker struct {
	river.WorkerDefaults[QueryJobArgs]
	Executor QueryExecutor
}

func (w *QueryJobWorker) Work(ctx context.Context, job *river.Job[QueryJobArgs]) error {
	return w.Executor.ExecuteQueryDirect(ctx, job.Args.Namespace, job.Args.Name)
}

func (w *QueryJobWorker) Timeout(job *river.Job[QueryJobArgs]) time.Duration {
	if job.Args.TimeoutSeconds > 0 {
		return time.Duration(job.Args.TimeoutSeconds)*time.Second + TimeoutBuffer
	}
	return time.Duration(DefaultTimeoutSeconds)*time.Second + TimeoutBuffer
}
