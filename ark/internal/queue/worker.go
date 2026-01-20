package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/riverqueue/river"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

type QueryExecutionJob struct {
	QueryName      string `json:"queryName"`
	QueryNamespace string `json:"queryNamespace"`
	QueryUID       string `json:"queryUID"`
}

func (QueryExecutionJob) Kind() string {
	return "QueryExecutionJob"
}

type QueryExecutor interface {
	ExecuteQuery(ctx context.Context, query *arkv1alpha1.Query) error
	GetClient() client.Client
}

type QueryExecutionWorker struct {
	river.WorkerDefaults[QueryExecutionJob]
	executor QueryExecutor
}

func NewQueryExecutionWorker(executor QueryExecutor) *QueryExecutionWorker {
	return &QueryExecutionWorker{
		executor: executor,
	}
}

func (w *QueryExecutionWorker) Work(ctx context.Context, job *river.Job[QueryExecutionJob]) error {
	log := logf.FromContext(ctx).WithValues(
		"query", job.Args.QueryNamespace+"/"+job.Args.QueryName,
		"queryUID", job.Args.QueryUID,
		"jobID", job.ID,
	)

	log.Info("Starting query execution job")

	namespacedName := types.NamespacedName{
		Name:      job.Args.QueryName,
		Namespace: job.Args.QueryNamespace,
	}

	var query arkv1alpha1.Query
	if err := w.executor.GetClient().Get(ctx, namespacedName, &query); err != nil {
		log.Error(err, "Failed to fetch Query resource")
		return fmt.Errorf("failed to fetch query: %w", err)
	}

	if string(query.UID) != job.Args.QueryUID {
		log.Info("Query UID mismatch, skipping execution (query may have been recreated)")
		return nil
	}

	if query.Spec.Cancel {
		log.Info("Query cancellation requested, marking as canceled")
		return w.updateQueryStatus(ctx, &query, "canceled", nil)
	}

	if err := w.updateQueryStatus(ctx, &query, "running", nil); err != nil {
		log.Error(err, "Failed to update query status to running")
		return err
	}

	startTime := time.Now()
	if err := w.executor.ExecuteQuery(ctx, &query); err != nil {
		log.Error(err, "Query execution failed")
		if updateErr := w.updateQueryStatus(ctx, &query, "error", nil); updateErr != nil {
			log.Error(updateErr, "Failed to update query status to error")
		}
		return fmt.Errorf("query execution failed: %w", err)
	}

	duration := &metav1.Duration{Duration: time.Since(startTime)}

	if err := w.executor.GetClient().Get(ctx, namespacedName, &query); err != nil {
		log.Error(err, "Failed to re-fetch Query resource after execution")
		return fmt.Errorf("failed to re-fetch query: %w", err)
	}

	queryStatus := "done"
	if query.Status.Response != nil && query.Status.Response.Phase != "" {
		queryStatus = query.Status.Response.Phase
	}

	if err := w.updateQueryStatus(ctx, &query, queryStatus, duration); err != nil {
		log.Error(err, "Failed to update final query status")
		return err
	}

	log.Info("Query execution completed", "status", queryStatus, "duration", duration.Duration)
	return nil
}

func (w *QueryExecutionWorker) updateQueryStatus(ctx context.Context, query *arkv1alpha1.Query, phase string, duration *metav1.Duration) error {
	query.Status.Phase = phase
	if duration != nil {
		query.Status.Duration = duration
	}

	if phase == "done" || phase == "canceled" || phase == "error" {
		now := metav1.Now()
		condition := metav1.Condition{
			Type:               string(arkv1alpha1.QueryCompleted),
			Status:             metav1.ConditionTrue,
			LastTransitionTime: now,
			Reason:             "QueryFinished",
			Message:            fmt.Sprintf("Query finished with phase: %s", phase),
		}

		found := false
		for i, c := range query.Status.Conditions {
			if c.Type == condition.Type {
				query.Status.Conditions[i] = condition
				found = true
				break
			}
		}
		if !found {
			query.Status.Conditions = append(query.Status.Conditions, condition)
		}
	}

	if err := w.executor.GetClient().Status().Update(ctx, query); err != nil {
		return fmt.Errorf("failed to update query status: %w", err)
	}

	return nil
}

func (j *QueryExecutionJob) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		QueryName      string `json:"queryName"`
		QueryNamespace string `json:"queryNamespace"`
		QueryUID       string `json:"queryUID"`
	}{
		QueryName:      j.QueryName,
		QueryNamespace: j.QueryNamespace,
		QueryUID:       j.QueryUID,
	})
}

func (j *QueryExecutionJob) UnmarshalJSON(data []byte) error {
	var v struct {
		QueryName      string `json:"queryName"`
		QueryNamespace string `json:"queryNamespace"`
		QueryUID       string `json:"queryUID"`
	}
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	j.QueryName = v.QueryName
	j.QueryNamespace = v.QueryNamespace
	j.QueryUID = v.QueryUID
	return nil
}
