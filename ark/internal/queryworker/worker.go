package queryworker

import (
	"context"

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
