//go:build integration
// +build integration

package postgresql

import (
	"context"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/watch"
	"mckinsey.com/ark/internal/storage"
)

func newTestBackend(t *testing.T) *PostgreSQLBackend {
	t.Helper()
	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		t.Skip("POSTGRES_HOST not set")
	}
	port := 5432
	if p := os.Getenv("POSTGRES_PORT"); p != "" {
		fmt.Sscanf(p, "%d", &port)
	}
	backend, err := New(Config{
		Host:     host,
		Port:     port,
		Database: "ark",
		User:     "postgres",
		Password: os.Getenv("POSTGRES_PASSWORD"),
		SSLMode:  "disable",
	}, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	return backend
}

func createTestResource(t *testing.T, backend *PostgreSQLBackend, kind, ns, name string) {
	t.Helper()
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
			UID:       fmt.Sprintf("uid-%s-%s-%s", kind, ns, name),
		},
		Spec: map[string]interface{}{"test": true},
	}
	if err := backend.Create(context.Background(), kind, ns, name, obj); err != nil {
		t.Fatalf("Create %s/%s/%s failed: %v", kind, ns, name, err)
	}
}

func TestWatch_EventDropUnderBurst(t *testing.T) {
	backend := newTestBackend(t)
	defer backend.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	kind := "WatchDropTest"
	ns := "drop-test"
	count := 150

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)

	w, err := backend.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch failed: %v", err)
	}
	defer w.Stop()

	// Drain initial bookmark
	drainTimeout := time.After(5 * time.Second)
	for {
		select {
		case ev := <-w.ResultChan():
			if ev.Type == watch.Bookmark {
				goto drained
			}
		case <-drainTimeout:
			goto drained
		}
	}
drained:

	// DO NOT read from the channel — simulate a slow consumer
	// Create resources rapidly to fill the buffer (100)
	for i := range count {
		name := fmt.Sprintf("drop-test-%d", i)
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
				UID:       fmt.Sprintf("uid-drop-%d", i),
			},
			Spec: map[string]interface{}{"index": i},
		}
		_ = backend.Create(ctx, kind, ns, name, obj)
	}

	// Wait for notifications to propagate
	time.Sleep(5 * time.Second)

	// Now drain the channel and count events
	received := 0
	for {
		select {
		case ev := <-w.ResultChan():
			if ev.Type == watch.Added {
				received++
			}
		default:
			goto done
		}
	}
done:

	t.Logf("Created %d resources, received %d ADDED events (channel buffer=100)", count, received)

	if received < count {
		t.Logf("CONFIRMED: %d events were dropped (%d created, %d received)", count-received, count, received)
	} else {
		t.Log("No drops detected — consumer kept up or notifications coalesced")
	}

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)
}

func TestWatch_VersionSkipping(t *testing.T) {
	backend := newTestBackend(t)
	defer backend.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	kind := "VersionSkipTest"
	ns := "version-test"
	name := "target"

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)

	createTestResource(t, backend, kind, ns, name)

	w, err := backend.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch failed: %v", err)
	}
	defer w.Stop()

	// Drain initial ADDED + bookmark
	time.Sleep(2 * time.Second)
	for {
		select {
		case <-w.ResultChan():
		default:
			goto drained
		}
	}
drained:

	// Rapid-fire 30 updates
	updateCount := 30
	for i := range updateCount {
		got, err := backend.Get(ctx, kind, ns, name)
		if err != nil {
			t.Fatalf("Get failed at iteration %d: %v", i, err)
		}
		testObj := got.(*integrationTestObject)
		testObj.Spec = map[string]interface{}{"iteration": i}
		if err := backend.Update(ctx, kind, ns, name, testObj); err != nil {
			if err == storage.ErrConflict {
				continue // retry
			}
			t.Fatalf("Update failed at iteration %d: %v", i, err)
		}
	}

	// Wait for notifications to propagate
	time.Sleep(5 * time.Second)

	// Collect all MODIFIED events
	var versions []string
	for {
		select {
		case ev := <-w.ResultChan():
			if ev.Type == watch.Modified {
				obj := ev.Object.(*integrationTestObject)
				versions = append(versions, obj.Metadata.ResourceVersion)
			}
		default:
			goto collected
		}
	}
collected:

	t.Logf("Performed %d updates, received %d MODIFIED events", updateCount, len(versions))
	t.Logf("Versions received: %v", versions)

	if len(versions) < updateCount {
		t.Logf("CONFIRMED: %d versions were skipped (%d updates, %d events)", updateCount-len(versions), updateCount, len(versions))
	}

	// Check monotonic ordering
	for i := 1; i < len(versions); i++ {
		if versions[i] <= versions[i-1] {
			t.Errorf("OUT OF ORDER: version[%d]=%s <= version[%d]=%s", i, versions[i], i-1, versions[i-1])
		}
	}

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)
}

func TestWatch_NotifyLatency(t *testing.T) {
	backend := newTestBackend(t)
	defer backend.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	kind := "LatencyTest"
	ns := "latency-test"

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)

	w, err := backend.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch failed: %v", err)
	}
	defer w.Stop()

	// Drain bookmark
	time.Sleep(2 * time.Second)
	for {
		select {
		case <-w.ResultChan():
		default:
			goto drained
		}
	}
drained:

	iterations := 20
	var latencies []time.Duration

	for i := range iterations {
		name := fmt.Sprintf("latency-%d", i)
		start := time.Now()

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
				UID:       fmt.Sprintf("uid-latency-%d", i),
			},
			Spec: map[string]interface{}{"index": i},
		}
		_ = backend.Create(ctx, kind, ns, name, obj)

		select {
		case <-w.ResultChan():
			latencies = append(latencies, time.Since(start))
		case <-time.After(10 * time.Second):
			t.Fatalf("Timeout waiting for watch event %d", i)
		}
	}

	var total time.Duration
	var max time.Duration
	for _, l := range latencies {
		total += l
		if l > max {
			max = l
		}
	}
	avg := total / time.Duration(len(latencies))

	t.Logf("Watch notification latency over %d creates:", len(latencies))
	t.Logf("  Average: %v", avg)
	t.Logf("  Max:     %v", max)
	t.Logf("  All:     %v", latencies)

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)
}

func TestWatch_ConcurrentWriteOrdering(t *testing.T) {
	backend := newTestBackend(t)
	defer backend.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	kind := "OrderTest"
	ns := "order-test"

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)

	w, err := backend.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch failed: %v", err)
	}
	defer w.Stop()

	time.Sleep(2 * time.Second)
	for {
		select {
		case <-w.ResultChan():
		default:
			goto drained
		}
	}
drained:

	// Concurrent creates from multiple goroutines
	writers := 6
	perWriter := 10
	_ = writers * perWriter
	var wg sync.WaitGroup
	var created atomic.Int32

	for w := range writers {
		wg.Add(1)
		go func(writerID int) {
			defer wg.Done()
			for i := range perWriter {
				name := fmt.Sprintf("order-%d-%d", writerID, i)
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
						UID:       fmt.Sprintf("uid-order-%d-%d", writerID, i),
					},
					Spec: map[string]interface{}{"writer": writerID, "index": i},
				}
				if err := backend.Create(ctx, kind, ns, name, obj); err == nil {
					created.Add(1)
				}
			}
		}(w)
	}
	wg.Wait()

	time.Sleep(5 * time.Second)

	var events []watch.Event
	for {
		select {
		case ev := <-w.ResultChan():
			if ev.Type == watch.Added {
				events = append(events, ev)
			}
		default:
			goto collected
		}
	}
collected:

	t.Logf("Created %d resources from %d concurrent writers, received %d events", created.Load(), writers, len(events))

	if len(events) < int(created.Load()) {
		t.Logf("CONFIRMED: %d events lost under concurrent writes", int(created.Load())-len(events))
	}

	// Check version ordering
	outOfOrder := 0
	for i := 1; i < len(events); i++ {
		prev := events[i-1].Object.(*integrationTestObject).Metadata.ResourceVersion
		curr := events[i].Object.(*integrationTestObject).Metadata.ResourceVersion
		if curr <= prev {
			outOfOrder++
		}
	}
	if outOfOrder > 0 {
		t.Logf("CONFIRMED: %d out-of-order events detected", outOfOrder)
	} else {
		t.Log("All events arrived in resourceVersion order")
	}

	backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)
}

func TestWatch_CrossReplicaDelivery(t *testing.T) {
	replicaA := newTestBackend(t)
	defer replicaA.Close()
	replicaB := newTestBackend(t)
	defer replicaB.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	kind := "CrossReplicaTest"
	ns := "replica-test"
	count := 50

	replicaA.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)

	w, err := replicaB.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch on replica B failed: %v", err)
	}
	defer w.Stop()

	time.Sleep(2 * time.Second)
	for {
		select {
		case <-w.ResultChan():
		default:
			goto drained
		}
	}
drained:

	for i := range count {
		name := fmt.Sprintf("cross-replica-%d", i)
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
			t.Fatalf("Create on replica A failed: %v", err)
		}
	}

	t.Logf("Created %d resources on replica A, waiting for replica B watcher...", count)

	received := 0
	deadline := time.After(15 * time.Second)
	for received < count {
		select {
		case ev := <-w.ResultChan():
			if ev.Type == watch.Added || ev.Type == watch.Modified {
				received++
			}
		case <-deadline:
			goto timeout
		}
	}
timeout:

	t.Logf("Replica B received %d/%d events", received, count)

	if received == 0 {
		t.Fatal("Replica B received ZERO events — cross-replica delivery is broken")
	}
	if received >= count {
		t.Log("All events delivered cross-replica via pg_notify nudge")
	}

	replicaA.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)
}

func TestWatch_CrossReplicaBurst(t *testing.T) {
	replicaA := newTestBackend(t)
	defer replicaA.Close()
	replicaB := newTestBackend(t)
	defer replicaB.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	kind := "CrossBurstTest"
	ns := "burst-replica-test"
	count := 200

	replicaA.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)

	w, err := replicaB.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch on replica B failed: %v", err)
	}
	defer w.Stop()

	time.Sleep(2 * time.Second)
	for {
		select {
		case <-w.ResultChan():
		default:
			goto drained2
		}
	}
drained2:

	var created atomic.Int32
	for i := range count {
		name := fmt.Sprintf("burst-cross-%d", i)
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
				UID:       fmt.Sprintf("uid-burst-cross-%d", i),
			},
			Spec: map[string]interface{}{"index": i},
		}
		if err := replicaA.Create(ctx, kind, ns, name, obj); err == nil {
			created.Add(1)
		}
	}

	actual := int(created.Load())
	t.Logf("Created %d/%d resources on replica A, waiting for replica B...", actual, count)

	seen := make(map[string]bool)
	deadline := time.After(45 * time.Second)
	for len(seen) < actual {
		select {
		case ev := <-w.ResultChan():
			if ev.Type == watch.Added || ev.Type == watch.Modified {
				if obj, ok := ev.Object.(*integrationTestObject); ok {
					seen[obj.Metadata.Name] = true
				}
			}
		case <-deadline:
			goto timeout2
		}
	}
timeout2:

	var dbCount int
	replicaB.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM resources WHERE kind = $1 AND namespace = $2", kind, ns).Scan(&dbCount)

	t.Logf("Replica B saw %d unique resources, DB has %d, attempted %d", len(seen), dbCount, count)

	if len(seen) < dbCount {
		t.Errorf("Replica B missed %d resources that exist in DB", dbCount-len(seen))
	}
	if len(seen) == dbCount {
		t.Log("Replica B saw every resource in the database — cross-replica delivery complete")
	}

	replicaA.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)
}

func TestWatch_CrossReplicaDelete(t *testing.T) {
	replicaA := newTestBackend(t)
	defer replicaA.Close()
	replicaB := newTestBackend(t)
	defer replicaB.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	kind := "CrossDeleteTest"
	ns := "delete-replica-test"

	replicaA.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)

	createTestResource(t, replicaA, kind, ns, "to-be-deleted")

	w, err := replicaB.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch on replica B failed: %v", err)
	}
	defer w.Stop()

	gotAdded := false
	initDeadline := time.After(5 * time.Second)
	for !gotAdded {
		select {
		case ev := <-w.ResultChan():
			if ev.Type == watch.Added {
				t.Log("Replica B saw initial ADDED event")
				gotAdded = true
			}
		case <-initDeadline:
			t.Fatal("Timeout waiting for initial ADDED event on replica B")
		}
	}

	time.Sleep(1 * time.Second)

	if err := replicaA.Delete(ctx, kind, ns, "to-be-deleted"); err != nil {
		t.Fatalf("Delete on replica A failed: %v", err)
	}

	gotDelete := false
	deadline := time.After(10 * time.Second)
	for {
		select {
		case ev := <-w.ResultChan():
			if ev.Type == watch.Deleted {
				obj := ev.Object.(*integrationTestObject)
				t.Logf("Replica B received DELETED event for %s", obj.Metadata.Name)
				gotDelete = true
				goto done
			}
		case <-deadline:
			goto done
		}
	}
done:

	if !gotDelete {
		t.Error("Replica B never received DELETED event — cross-replica delete delivery is broken")
	} else {
		t.Log("Cross-replica delete delivery confirmed")
	}

	replicaA.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1", kind)
}
