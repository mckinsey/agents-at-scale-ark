package queryworker

import "github.com/riverqueue/river"

type QueryJobArgs struct {
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
}

func (QueryJobArgs) Kind() string { return "ark_query_execution" }

func (QueryJobArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: QueueName}
}
