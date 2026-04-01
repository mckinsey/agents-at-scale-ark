//go:build integration
// +build integration

package postgresql

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/watch"
	"mckinsey.com/ark/internal/storage"
)

func collectEvents(w watch.Interface, timeout time.Duration) []watch.Event {
	var events []watch.Event
	deadline := time.After(timeout)
	for {
		select {
		case ev, ok := <-w.ResultChan():
			if !ok {
				return events
			}
			if ev.Type == watch.Bookmark {
				continue
			}
			events = append(events, ev)
		case <-deadline:
			return events
		}
	}
}

func TestWALReliability_NoEventLoss(t *testing.T) {
	backend := newTestBackend(t)
	defer backend.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	kind := "WALNoLossTest"
	ns := "wal-test"
	count := 500

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)

	w, err := backend.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch failed: %v", err)
	}
	defer w.Stop()

	time.Sleep(500 * time.Millisecond)

	for i := range count {
		name := fmt.Sprintf("resource-%d", i)
		obj := &integrationTestObject{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       kind,
			Metadata: struct {
				Name            string            `json:"name"`
				Namespace       string            `json:"namespace"`
				UID             string            `json:"uid"`
				ResourceVersion string            `json:"resourceVersion,omitempty"`
				Labels          map[string]string `json:"labels,omitempty"`
			}{
				Name:      name,
				Namespace: ns,
				UID:       fmt.Sprintf("uid-noloss-%d", i),
			},
			Spec: map[string]interface{}{"index": i},
		}
		if err := backend.Create(ctx, kind, ns, name, obj); err != nil {
			t.Fatalf("Create %d failed: %v", i, err)
		}
	}

	events := collectEvents(w, 30*time.Second)

	seen := make(map[string]bool)
	for _, ev := range events {
		if obj, ok := ev.Object.(*integrationTestObject); ok {
			seen[obj.Metadata.Name] = true
		}
	}

	if len(seen) != count {
		t.Errorf("WAL event loss: created %d resources, received %d unique events", count, len(seen))
		missing := 0
		for i := range count {
			if !seen[fmt.Sprintf("resource-%d", i)] {
				missing++
			}
		}
		t.Errorf("Missing %d resources from watch events", missing)
	} else {
		t.Logf("All %d resources received via WAL CDC (zero loss)", count)
	}

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)
}

func TestWALReliability_ConcurrentWriterDelivery(t *testing.T) {
	backend := newTestBackend(t)
	defer backend.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	kind := "WALConcurrentTest"
	ns := "wal-concurrent"
	writers := 10
	perWriter := 50
	total := writers * perWriter

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)

	w, err := backend.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch failed: %v", err)
	}
	defer w.Stop()

	time.Sleep(500 * time.Millisecond)

	var created atomic.Int32
	var wg sync.WaitGroup
	for wr := range writers {
		wg.Add(1)
		go func(writerID int) {
			defer wg.Done()
			for i := range perWriter {
				name := fmt.Sprintf("w%d-r%d", writerID, i)
				obj := &integrationTestObject{
					APIVersion: "ark.mckinsey.com/v1alpha1",
					Kind:       kind,
					Metadata: struct {
						Name            string            `json:"name"`
						Namespace       string            `json:"namespace"`
						UID             string            `json:"uid"`
						ResourceVersion string            `json:"resourceVersion,omitempty"`
						Labels          map[string]string `json:"labels,omitempty"`
					}{
						Name:      name,
						Namespace: ns,
						UID:       fmt.Sprintf("uid-conc-%d-%d", writerID, i),
					},
					Spec: map[string]interface{}{"writer": writerID, "index": i},
				}
				if err := backend.Create(ctx, kind, ns, name, obj); err == nil {
					created.Add(1)
				}
			}
		}(wr)
	}
	wg.Wait()

	actualCreated := int(created.Load())
	t.Logf("Created %d/%d resources across %d writers", actualCreated, total, writers)

	events := collectEvents(w, 30*time.Second)

	seen := make(map[string]bool)
	for _, ev := range events {
		if obj, ok := ev.Object.(*integrationTestObject); ok {
			seen[obj.Metadata.Name] = true
		}
	}

	if len(seen) < actualCreated {
		t.Errorf("WAL concurrent loss: created %d, received %d unique events", actualCreated, len(seen))
	} else {
		t.Logf("All %d concurrent resources received (zero loss)", len(seen))
	}

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)
}

func TestWALReliability_StatusUpdatePropagation(t *testing.T) {
	backend := newTestBackend(t)
	defer backend.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	kind := "WALStatusTest"
	ns := "wal-status"
	name := "status-target"
	updates := 100

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)

	obj := &integrationTestObject{
		APIVersion: "ark.mckinsey.com/v1alpha1",
		Kind:       kind,
		Metadata: struct {
			Name            string            `json:"name"`
			Namespace       string            `json:"namespace"`
			UID             string            `json:"uid"`
			ResourceVersion string            `json:"resourceVersion,omitempty"`
			Labels          map[string]string `json:"labels,omitempty"`
		}{
			Name:      name,
			Namespace: ns,
			UID:       "uid-status-target",
		},
		Spec: map[string]interface{}{"test": true},
	}
	if err := backend.Create(ctx, kind, ns, name, obj); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	w, err := backend.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch failed: %v", err)
	}
	defer w.Stop()

	time.Sleep(500 * time.Millisecond)

	for i := range updates {
		current, err := backend.Get(ctx, kind, ns, name)
		if err != nil {
			t.Logf("Get before update %d failed: %v", i, err)
			continue
		}
		currentObj := current.(*integrationTestObject)
		currentObj.Status = map[string]interface{}{"phase": fmt.Sprintf("update-%d", i)}
		if err := backend.UpdateStatus(ctx, kind, ns, name, currentObj); err != nil {
			t.Logf("UpdateStatus %d failed: %v", i, err)
		}
	}

	events := collectEvents(w, 10*time.Second)

	var lastPhase string
	for _, ev := range events {
		if obj, ok := ev.Object.(*integrationTestObject); ok {
			if phase, ok := obj.Status["phase"].(string); ok {
				lastPhase = phase
			}
		}
	}

	expected := fmt.Sprintf("update-%d", updates-1)
	if lastPhase != expected {
		t.Errorf("Final status not propagated: got %q, want %q (received %d events)", lastPhase, expected, len(events))
	} else {
		t.Logf("Final status update propagated correctly (%d events received)", len(events))
	}

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)
}

func TestWALReliability_CrossReplicaFullDelivery(t *testing.T) {
	replicaA := newTestBackend(t)
	defer replicaA.Close()
	replicaB := newTestBackend(t)
	defer replicaB.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	kind := "WALCrossReplicaTest"
	ns := "wal-cross"
	count := 200

	replicaA.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)

	w, err := replicaB.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch on replicaB failed: %v", err)
	}
	defer w.Stop()

	time.Sleep(500 * time.Millisecond)

	for i := range count {
		name := fmt.Sprintf("cross-%d", i)
		obj := &integrationTestObject{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       kind,
			Metadata: struct {
				Name            string            `json:"name"`
				Namespace       string            `json:"namespace"`
				UID             string            `json:"uid"`
				ResourceVersion string            `json:"resourceVersion,omitempty"`
				Labels          map[string]string `json:"labels,omitempty"`
			}{
				Name:      name,
				Namespace: ns,
				UID:       fmt.Sprintf("uid-cross-%d", i),
			},
			Spec: map[string]interface{}{"index": i},
		}
		if err := replicaA.Create(ctx, kind, ns, name, obj); err != nil {
			t.Fatalf("Create %d on replicaA failed: %v", i, err)
		}
	}

	events := collectEvents(w, 30*time.Second)

	seen := make(map[string]bool)
	for _, ev := range events {
		if obj, ok := ev.Object.(*integrationTestObject); ok {
			seen[obj.Metadata.Name] = true
		}
	}

	if len(seen) < count {
		t.Errorf("Cross-replica loss: created %d on A, received %d on B", count, len(seen))
	} else {
		t.Logf("Cross-replica: all %d resources delivered to replica B", len(seen))
	}

	replicaA.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)
}

func TestWALReliability_ReconnectionRecovery(t *testing.T) {
	backend := newTestBackend(t)
	defer backend.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	kind := "WALReconnectTest"
	ns := "wal-reconnect"

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)

	w, err := backend.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch failed: %v", err)
	}
	defer w.Stop()

	time.Sleep(500 * time.Millisecond)

	for i := range 50 {
		name := fmt.Sprintf("batch1-%d", i)
		obj := &integrationTestObject{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       kind,
			Metadata: struct {
				Name            string            `json:"name"`
				Namespace       string            `json:"namespace"`
				UID             string            `json:"uid"`
				ResourceVersion string            `json:"resourceVersion,omitempty"`
				Labels          map[string]string `json:"labels,omitempty"`
			}{
				Name:      name,
				Namespace: ns,
				UID:       fmt.Sprintf("uid-batch1-%d", i),
			},
			Spec: map[string]interface{}{"batch": 1},
		}
		_ = backend.Create(ctx, kind, ns, name, obj)
	}

	batch1Events := collectEvents(w, 10*time.Second)
	batch1Seen := make(map[string]bool)
	for _, ev := range batch1Events {
		if obj, ok := ev.Object.(*integrationTestObject); ok {
			batch1Seen[obj.Metadata.Name] = true
		}
	}
	t.Logf("Batch 1: received %d events before slot drop", len(batch1Seen))

	_, err = backend.db.ExecContext(ctx, `
		SELECT pg_terminate_backend(active_pid)
		FROM pg_replication_slots
		WHERE slot_name LIKE 'ark_cdc_%' AND active = true
	`)
	if err != nil {
		t.Logf("Slot termination: %v (may be expected)", err)
	}

	time.Sleep(5 * time.Second)

	for i := range 50 {
		name := fmt.Sprintf("batch2-%d", i)
		obj := &integrationTestObject{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       kind,
			Metadata: struct {
				Name            string            `json:"name"`
				Namespace       string            `json:"namespace"`
				UID             string            `json:"uid"`
				ResourceVersion string            `json:"resourceVersion,omitempty"`
				Labels          map[string]string `json:"labels,omitempty"`
			}{
				Name:      name,
				Namespace: ns,
				UID:       fmt.Sprintf("uid-batch2-%d", i),
			},
			Spec: map[string]interface{}{"batch": 2},
		}
		_ = backend.Create(ctx, kind, ns, name, obj)
	}

	batch2Events := collectEvents(w, 15*time.Second)
	batch2Seen := make(map[string]bool)
	for _, ev := range batch2Events {
		if obj, ok := ev.Object.(*integrationTestObject); ok {
			if obj.Metadata.Name != "" {
				batch2Seen[obj.Metadata.Name] = true
			}
		}
	}

	batch2Count := 0
	for name := range batch2Seen {
		if len(name) > 6 && name[:6] == "batch2" {
			batch2Count++
		}
	}

	if batch2Count < 50 {
		t.Errorf("Reconnection recovery: only %d/50 batch2 resources delivered after slot kill", batch2Count)
	} else {
		t.Logf("Reconnection recovery: all %d batch2 resources delivered after WAL consumer reconnected", batch2Count)
	}

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)
}
