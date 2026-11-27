//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"testing"
	"time"

	"github.com/jackc/pglogrepl"
	"github.com/jackc/pgx/v5/pgconn"
	"k8s.io/apimachinery/pkg/watch"
	"mckinsey.com/ark/internal/storage"
)

func openSlotChecker(t *testing.T, cfg Config) *sql.DB {
	t.Helper()
	db, err := sql.Open("postgres", fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.Database, cfg.SSLMode,
	))
	if err != nil {
		t.Fatalf("open checker connection: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func dropSlotIfExists(db *sql.DB, name string) {
	_, _ = db.Exec("SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = $1", name)
}

func slotState(t *testing.T, db *sql.DB, name string) (exists, active, temporary bool) {
	t.Helper()
	err := db.QueryRow("SELECT active, temporary FROM pg_replication_slots WHERE slot_name = $1", name).Scan(&active, &temporary)
	if err == sql.ErrNoRows {
		return false, false, false
	}
	if err != nil {
		t.Fatalf("query pg_replication_slots for %s: %v", name, err)
	}
	return true, active, temporary
}

func waitUntil(t *testing.T, timeout time.Duration, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("%s not satisfied within %v", what, timeout)
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func waitForActiveReplicaSlot(t *testing.T, db *sql.DB, replica *PostgreSQLBackend) string {
	t.Helper()
	var name string
	waitUntil(t, 15*time.Second, "replica replication slot to be active", func() bool {
		name = replica.currentSlotName()
		if name == "" {
			return false
		}
		exists, active, temporary := slotState(t, db, name)
		return exists && active && temporary
	})
	return name
}

func drainEvents(w watch.Interface) {
	for {
		select {
		case <-w.ResultChan():
		default:
			return
		}
	}
}

func waitForAdded(t *testing.T, w watch.Interface, timeout time.Duration) (time.Duration, bool) {
	t.Helper()
	start := time.Now()
	deadline := time.After(timeout)
	for {
		select {
		case ev := <-w.ResultChan():
			if ev.Type == watch.Added {
				return time.Since(start), true
			}
		case <-deadline:
			return time.Since(start), false
		}
	}
}

func holdSlotActive(t *testing.T, cfg Config, slot string) (release func()) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	conn, err := pgconn.Connect(ctx, fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s replication=database",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.Database, cfg.SSLMode,
	))
	if err != nil {
		cancel()
		t.Fatalf("open replication connection: %v", err)
	}
	err = pglogrepl.StartReplication(ctx, conn, slot, 0, pglogrepl.StartReplicationOptions{
		PluginArgs: []string{
			"proto_version '1'",
			fmt.Sprintf("publication_names '%s'", walPublicationName),
		},
	})
	if err != nil {
		cancel()
		_ = conn.Close(context.Background())
		t.Fatalf("start replication on %s: %v", slot, err)
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			if _, err := conn.ReceiveMessage(ctx); err != nil {
				return
			}
		}
	}()
	released := false
	release = func() {
		if released {
			return
		}
		released = true
		cancel()
		_ = conn.Close(context.Background())
		<-done
	}
	t.Cleanup(release)
	return release
}

func TestRollingUpdate_ActiveLegacySlotIsKeptUntilReleased_Integration(t *testing.T) {
	cfg := testConfig(t)
	checker := openSlotChecker(t, cfg)

	bootstrap := newTestBackend(t)
	defer bootstrap.Close()
	dropSlotIfExists(checker, walSlotName)
	if _, err := checker.Exec("SELECT pg_create_logical_replication_slot($1, 'pgoutput')", walSlotName); err != nil {
		t.Fatalf("create legacy slot: %v", err)
	}
	t.Cleanup(func() { dropSlotIfExists(checker, walSlotName) })
	releaseOldLeader := holdSlotActive(t, cfg, walSlotName)
	waitUntil(t, 10*time.Second, "legacy slot to become active", func() bool {
		exists, active, _ := slotState(t, checker, walSlotName)
		return exists && active
	})

	writer := newTestBackend(t)
	defer writer.Close()
	replica := newTestBackend(t)
	defer replica.Close()
	replica.StartWALConsumer()
	waitForActiveReplicaSlot(t, checker, replica)

	replica.dropLegacySlot(context.Background())
	if exists, active, _ := slotState(t, checker, walSlotName); !exists || !active {
		t.Fatalf("legacy slot held by an old leader must survive dropLegacySlot: exists=%v active=%v", exists, active)
	}

	kind := "RollingLegacyHeldTest"
	ns := "rolling-legacy-held"
	writer.db.Exec("DELETE FROM resources WHERE kind = $1", kind)
	defer writer.db.Exec("DELETE FROM resources WHERE kind = $1", kind)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w, err := replica.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch failed: %v", err)
	}
	defer w.Stop()
	time.Sleep(1 * time.Second)
	drainEvents(w)

	createTestResource(t, writer, kind, ns, "while-old-leader-active")
	elapsed, ok := waitForAdded(t, w, 5*time.Second)
	if !ok {
		t.Fatal("new replica did not receive the write through its own stream while the legacy slot was still held")
	}
	t.Logf("write reached the new replica in %v with the legacy slot still active", elapsed)

	releaseOldLeader()
	waitUntil(t, 15*time.Second, "legacy slot to become inactive", func() bool {
		exists, active, _ := slotState(t, checker, walSlotName)
		return !exists || !active
	})
	replica.dropLegacySlot(context.Background())
	if exists, _, _ := slotState(t, checker, walSlotName); exists {
		t.Fatal("legacy slot still present after the old leader released it and dropLegacySlot ran")
	}
}

func TestRollingUpdate_ReplicaWithoutSignalFallsBackToRelist_Integration(t *testing.T) {
	const relist = 3 * time.Second
	withFastRelist(t, relist)

	writer := newTestBackend(t)
	defer writer.Close()
	silent := newTestBackend(t)
	defer silent.Close()

	kind := "RollingSilentReplicaTest"
	ns := "rolling-silent"
	writer.db.Exec("DELETE FROM resources WHERE kind = $1", kind)
	defer writer.db.Exec("DELETE FROM resources WHERE kind = $1", kind)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w, err := silent.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch failed: %v", err)
	}
	defer w.Stop()
	time.Sleep(500 * time.Millisecond)
	drainEvents(w)

	createTestResource(t, writer, kind, ns, "no-signal")
	elapsed, ok := waitForAdded(t, w, 2*relist+2*time.Second)
	if !ok {
		t.Fatalf("replica with no WAL stream and no NOTIFY never saw the write within 2 relist intervals (%v)", 2*relist)
	}
	t.Logf("replica with no change signal delivered the write after %v (relist interval %v)", elapsed, relist)
}

func TestWALStream_ThreeReplicasHaveIndependentSlots_Integration(t *testing.T) {
	cfg := testConfig(t)
	checker := openSlotChecker(t, cfg)

	replicas := make([]*PostgreSQLBackend, 3)
	for i := range replicas {
		replicas[i] = newTestBackend(t)
		defer replicas[i].Close()
		replicas[i].StartWALConsumer()
	}

	slots := map[string]bool{}
	for _, r := range replicas {
		slots[waitForActiveReplicaSlot(t, checker, r)] = true
	}
	if len(slots) != 3 {
		t.Fatalf("expected 3 distinct replica slots, got %d: %v", len(slots), slots)
	}

	kind := "RollingThreeReplicaTest"
	ns := "rolling-three"
	replicas[0].db.Exec("DELETE FROM resources WHERE kind = $1", kind)
	defer replicas[0].db.Exec("DELETE FROM resources WHERE kind = $1", kind)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	watchers := make([]watch.Interface, len(replicas))
	for i, r := range replicas {
		w, err := r.Watch(ctx, kind, ns, storage.WatchOptions{})
		if err != nil {
			t.Fatalf("Watch on replica %d failed: %v", i, err)
		}
		defer w.Stop()
		watchers[i] = w
	}
	time.Sleep(1 * time.Second)
	for _, w := range watchers {
		drainEvents(w)
	}

	writeStart := time.Now()
	createTestResource(t, replicas[0], kind, ns, "fan-out-1")
	for i, w := range watchers {
		if _, ok := waitForAdded(t, w, 5*time.Second); !ok {
			t.Fatalf("replica %d did not receive the write within 5s", i)
		}
		t.Logf("replica %d received the write %v after it was created", i, time.Since(writeStart))
	}

	lost := replicas[2].currentSlotName()
	if err := replicas[2].Close(); err != nil {
		t.Fatalf("Close replica 2: %v", err)
	}
	waitUntil(t, 15*time.Second, "closed replica's slot to disappear", func() bool {
		exists, _, _ := slotState(t, checker, lost)
		return !exists
	})
	for i := 0; i < 2; i++ {
		if exists, active, _ := slotState(t, checker, replicas[i].currentSlotName()); !exists || !active {
			t.Fatalf("replica %d slot affected by another replica closing: exists=%v active=%v", i, exists, active)
		}
		drainEvents(watchers[i])
	}

	createTestResource(t, replicas[0], kind, ns, "fan-out-2")
	for i := 0; i < 2; i++ {
		if _, ok := waitForAdded(t, watchers[i], 5*time.Second); !ok {
			t.Fatalf("replica %d stopped receiving writes after replica 2 closed", i)
		}
	}
}

func TestWALStream_NoFreeSlotFallsBackToRelistThenRecovers_Integration(t *testing.T) {
	const relist = 3 * time.Second
	withFastRelist(t, relist)

	cfg := testConfig(t)
	checker := openSlotChecker(t, cfg)

	var maxSlotsText string
	if err := checker.QueryRow("SHOW max_replication_slots").Scan(&maxSlotsText); err != nil {
		t.Fatalf("show max_replication_slots: %v", err)
	}
	maxSlots, err := strconv.Atoi(maxSlotsText)
	if err != nil {
		t.Fatalf("parse max_replication_slots %q: %v", maxSlotsText, err)
	}
	waitUntil(t, 15*time.Second, "temporary replica slots from earlier tests to be released", func() bool {
		var n int
		if err := checker.QueryRow(
			"SELECT count(*) FROM pg_replication_slots WHERE slot_name LIKE $1", walSlotName+"\\_%",
		).Scan(&n); err != nil {
			t.Fatalf("count replica slots: %v", err)
		}
		return n == 0
	})
	var used int
	if err := checker.QueryRow("SELECT count(*) FROM pg_replication_slots").Scan(&used); err != nil {
		t.Fatalf("count slots: %v", err)
	}
	if maxSlots-used < 1 {
		t.Skipf("no free replication slot to occupy (max=%d used=%d)", maxSlots, used)
	}

	var fillers []string
	for i := 0; i < maxSlots-used; i++ {
		name := fmt.Sprintf("rolling_test_filler_%d", i)
		dropSlotIfExists(checker, name)
		if _, err := checker.Exec("SELECT pg_create_physical_replication_slot($1)", name); err != nil {
			t.Fatalf("create filler slot %s: %v", name, err)
		}
		fillers = append(fillers, name)
	}
	t.Cleanup(func() {
		for _, name := range fillers {
			dropSlotIfExists(checker, name)
		}
	})

	writer := newTestBackend(t)
	defer writer.Close()
	replica := newTestBackend(t)
	defer replica.Close()
	replica.StartWALConsumer()

	kind := "RollingNoFreeSlotTest"
	ns := "rolling-no-slot"
	writer.db.Exec("DELETE FROM resources WHERE kind = $1", kind)
	defer writer.db.Exec("DELETE FROM resources WHERE kind = $1", kind)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	w, err := replica.Watch(ctx, kind, ns, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch failed: %v", err)
	}
	defer w.Stop()
	time.Sleep(2 * time.Second)
	drainEvents(w)

	if name := replica.currentSlotName(); name != "" {
		t.Fatalf("replica claims slot %q although every slot is taken", name)
	}

	createTestResource(t, writer, kind, ns, "no-slot-1")
	elapsed, ok := waitForAdded(t, w, 2*relist+2*time.Second)
	if !ok {
		t.Fatal("replica with no free slot stopped serving watches instead of falling back to relist")
	}
	t.Logf("replica without a slot delivered the write after %v via relist", elapsed)

	if _, err := checker.Exec("SELECT pg_drop_replication_slot($1)", fillers[0]); err != nil {
		t.Fatalf("free a slot: %v", err)
	}
	fillers = fillers[1:]

	waitUntil(t, 45*time.Second, "replica to acquire a slot after one was freed", func() bool {
		return replica.currentSlotName() != ""
	})
	waitForActiveReplicaSlot(t, checker, replica)
}
