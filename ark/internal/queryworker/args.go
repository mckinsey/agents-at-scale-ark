package queryworker

import (
	"time"

	"github.com/riverqueue/river"
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

const (
	DefaultTimeoutSeconds = 300
	TimeoutBuffer         = 30 * time.Second
)

type QueryJobArgs struct {
	Namespace      string `json:"namespace"`
	Name           string `json:"name"`
	TimeoutSeconds int    `json:"timeoutSeconds,omitempty"`
}

func (QueryJobArgs) Kind() string { return "ark_query_execution" }

func (QueryJobArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       QueueName,
		MaxAttempts: 1,
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
		},
	}
}

func TimeoutSecondsFromObject(obj runtime.Object) int {
	query, ok := obj.(*arkv1alpha1.Query)
	if !ok || query.Spec.Timeout == nil {
		return DefaultTimeoutSeconds
	}
	seconds := int(query.Spec.Timeout.Duration.Seconds())
	if seconds <= 0 {
		return DefaultTimeoutSeconds
	}
	return seconds
}
