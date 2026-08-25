//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"

	"mckinsey.com/ark/internal/storage"
)

type integrationTestObject struct {
	APIVersion string `json:"apiVersion"`
	Kind       string `json:"kind"`
	Metadata   struct {
		Name            string            `json:"name"`
		Namespace       string            `json:"namespace"`
		UID             string            `json:"uid"`
		ResourceVersion string            `json:"resourceVersion,omitempty"`
		Labels          map[string]string `json:"labels,omitempty"`
	} `json:"metadata"`
	Spec   map[string]interface{} `json:"spec,omitempty"`
	Status map[string]interface{} `json:"status,omitempty"`
}

func (t *integrationTestObject) GetObjectKind() schema.ObjectKind { return schema.EmptyObjectKind }
func (t *integrationTestObject) DeepCopyObject() runtime.Object {
	data, _ := json.Marshal(t)
	c := &integrationTestObject{}
	_ = json.Unmarshal(data, c)
	return c
}

type integrationMockConverter struct{}

func (m *integrationMockConverter) NewObject(kind string) runtime.Object {
	return &integrationTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: kind}
}

func (m *integrationMockConverter) NewListObject(kind string) runtime.Object {
	return &integrationTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: kind + "List"}
}

func (m *integrationMockConverter) Encode(obj runtime.Object) ([]byte, error) {
	return json.Marshal(obj)
}

func (m *integrationMockConverter) Decode(kind string, data []byte) (runtime.Object, error) {
	obj := &integrationTestObject{}
	if err := json.Unmarshal(data, obj); err != nil {
		return nil, err
	}
	return obj, nil
}

func (m *integrationMockConverter) APIVersion(kind string) string {
	return "ark.mckinsey.com/v1alpha1"
}

func TestOptimisticConcurrency_Integration(t *testing.T) {
	cfg := testConfig(t)

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()
	backend.StartWALConsumer()

	ctx := context.Background()
	testName := "concurrency-test-resource"
	testNS := "integration-test"
	testKind := "TestResource"

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3", testKind, testNS, testName)

	obj := &integrationTestObject{
		APIVersion: "ark.mckinsey.com/v1alpha1",
		Kind:       testKind,
		Metadata: struct {
			Name            string            `json:"name"`
			Namespace       string            `json:"namespace"`
			UID             string            `json:"uid"`
			ResourceVersion string            `json:"resourceVersion,omitempty"`
			Labels          map[string]string `json:"labels,omitempty"`
		}{
			Name:      testName,
			Namespace: testNS,
			UID:       "test-uid-123",
			Labels:    map[string]string{"test": "true"},
		},
		Spec: map[string]interface{}{"model": "gpt-4"},
	}

	err = backend.Create(ctx, testKind, testNS, testName, obj)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	got, err := backend.Get(ctx, testKind, testNS, testName)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}

	testObj := got.(*integrationTestObject)
	originalRV := testObj.Metadata.ResourceVersion

	testObj.Spec["model"] = "gpt-4-turbo"
	err = backend.Update(ctx, testKind, testNS, testName, testObj)
	if err != nil {
		t.Fatalf("First Update failed: %v", err)
	}

	got, _ = backend.Get(ctx, testKind, testNS, testName)
	testObj = got.(*integrationTestObject)
	newRV := testObj.Metadata.ResourceVersion
	t.Logf("After update, resourceVersion: %s", newRV)

	if newRV == originalRV {
		t.Error("resourceVersion should have changed after update")
	}

	staleObj := &integrationTestObject{
		APIVersion: "ark.mckinsey.com/v1alpha1",
		Kind:       testKind,
		Metadata: struct {
			Name            string            `json:"name"`
			Namespace       string            `json:"namespace"`
			UID             string            `json:"uid"`
			ResourceVersion string            `json:"resourceVersion,omitempty"`
			Labels          map[string]string `json:"labels,omitempty"`
		}{
			Name:            testName,
			Namespace:       testNS,
			UID:             "test-uid-123",
			ResourceVersion: originalRV,
		},
		Spec: map[string]interface{}{"model": "gpt-3.5"},
	}

	err = backend.Update(ctx, testKind, testNS, testName, staleObj)
	if err != storage.ErrConflict {
		t.Errorf("Expected ErrConflict for stale update, got: %v", err)
	} else {
		t.Log("Correctly received ErrConflict for stale resourceVersion")
	}

	testObj.Spec["model"] = "claude-3"
	err = backend.Update(ctx, testKind, testNS, testName, testObj)
	if err != nil {
		t.Errorf("Update with current resourceVersion failed: %v", err)
	} else {
		t.Log("Successfully updated with current resourceVersion")
	}

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3", testKind, testNS, testName)
}

func TestOptimisticConcurrency_Status_Integration(t *testing.T) {
	cfg := testConfig(t)

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()
	backend.StartWALConsumer()

	ctx := context.Background()
	testName := "status-concurrency-test"
	testNS := "integration-test"
	testKind := "TestResource"

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3", testKind, testNS, testName)

	obj := &integrationTestObject{
		APIVersion: "ark.mckinsey.com/v1alpha1",
		Kind:       testKind,
		Metadata: struct {
			Name            string            `json:"name"`
			Namespace       string            `json:"namespace"`
			UID             string            `json:"uid"`
			ResourceVersion string            `json:"resourceVersion,omitempty"`
			Labels          map[string]string `json:"labels,omitempty"`
		}{
			Name:      testName,
			Namespace: testNS,
			UID:       "test-uid-status",
		},
		Spec:   map[string]interface{}{"model": "gpt-4"},
		Status: map[string]interface{}{"phase": "Pending"},
	}

	err = backend.Create(ctx, testKind, testNS, testName, obj)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	got, _ := backend.Get(ctx, testKind, testNS, testName)
	testObj := got.(*integrationTestObject)
	originalRV := testObj.Metadata.ResourceVersion
	t.Logf("Created object with resourceVersion: %s", originalRV)

	testObj.Status = map[string]interface{}{"phase": "Running"}
	err = backend.UpdateStatus(ctx, testKind, testNS, testName, testObj)
	if err != nil {
		t.Fatalf("UpdateStatus failed: %v", err)
	}

	got, _ = backend.Get(ctx, testKind, testNS, testName)
	testObj = got.(*integrationTestObject)
	newRV := testObj.Metadata.ResourceVersion
	t.Logf("After status update, resourceVersion: %s, status: %v", newRV, testObj.Status)

	if newRV == originalRV {
		t.Error("resourceVersion should have changed after status update")
	}

	staleObj := &integrationTestObject{
		APIVersion: "ark.mckinsey.com/v1alpha1",
		Kind:       testKind,
		Metadata: struct {
			Name            string            `json:"name"`
			Namespace       string            `json:"namespace"`
			UID             string            `json:"uid"`
			ResourceVersion string            `json:"resourceVersion,omitempty"`
			Labels          map[string]string `json:"labels,omitempty"`
		}{
			Name:            testName,
			Namespace:       testNS,
			UID:             "test-uid-status",
			ResourceVersion: originalRV,
		},
		Status: map[string]interface{}{"phase": "Failed"},
	}

	err = backend.UpdateStatus(ctx, testKind, testNS, testName, staleObj)
	if err != storage.ErrConflict {
		t.Errorf("Expected ErrConflict for stale status update, got: %v", err)
	} else {
		t.Log("Correctly received ErrConflict for stale status update")
	}

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3", testKind, testNS, testName)
}

func TestCreateAlreadyExists_Integration(t *testing.T) {
	cfg := testConfig(t)

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()
	backend.StartWALConsumer()

	ctx := context.Background()
	testName := "already-exists-test-resource"
	testNS := "integration-test"
	testKind := "TestResource"

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3", testKind, testNS, testName)

	obj := &integrationTestObject{
		APIVersion: "ark.mckinsey.com/v1alpha1",
		Kind:       testKind,
		Metadata: struct {
			Name            string            `json:"name"`
			Namespace       string            `json:"namespace"`
			UID             string            `json:"uid"`
			ResourceVersion string            `json:"resourceVersion,omitempty"`
			Labels          map[string]string `json:"labels,omitempty"`
		}{
			Name:      testName,
			Namespace: testNS,
			UID:       "test-uid-already-exists",
		},
		Spec: map[string]interface{}{"k": "v"},
	}

	if err := backend.Create(ctx, testKind, testNS, testName, obj); err != nil {
		t.Fatalf("first Create failed: %v", err)
	}

	dupErr := backend.Create(ctx, testKind, testNS, testName, obj)
	if dupErr != storage.ErrAlreadyExists {
		t.Errorf("Expected ErrAlreadyExists for duplicate Create, got: %v", dupErr)
	} else {
		t.Log("Correctly received ErrAlreadyExists for duplicate Create")
	}

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3", testKind, testNS, testName)
}

func TestWatchAddedForFirstSeenUID_Integration(t *testing.T) {
	cfg := testConfig(t)

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()
	backend.StartWALConsumer()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	testNS := "integration-test"
	testKind := "TestResource"
	testName := "watch-added-test-resource"

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3", testKind, testNS, testName)

	w, err := backend.Watch(ctx, testKind, testNS, storage.WatchOptions{})
	if err != nil {
		t.Fatalf("Watch failed: %v", err)
	}
	defer w.Stop()

	time.Sleep(500 * time.Millisecond)

	obj := &integrationTestObject{
		APIVersion: "ark.mckinsey.com/v1alpha1",
		Kind:       testKind,
		Metadata: struct {
			Name            string            `json:"name"`
			Namespace       string            `json:"namespace"`
			UID             string            `json:"uid"`
			ResourceVersion string            `json:"resourceVersion,omitempty"`
			Labels          map[string]string `json:"labels,omitempty"`
		}{
			Name:      testName,
			Namespace: testNS,
			UID:       "test-uid-watch-added",
		},
		Spec: map[string]interface{}{"k": "v"},
	}

	if err := backend.Create(ctx, testKind, testNS, testName, obj); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	deadline := time.After(10 * time.Second)
	var firstEventType watch.EventType
	var firstName string
	for {
		select {
		case ev, ok := <-w.ResultChan():
			if !ok {
				t.Fatal("watch channel closed before any event")
			}
			testObj, _ := ev.Object.(*integrationTestObject)
			if testObj == nil || testObj.Metadata.Name != testName {
				continue
			}
			firstEventType = ev.Type
			firstName = testObj.Metadata.Name
		case <-deadline:
			t.Fatal("timeout waiting for watch event")
		}
		break
	}

	if firstEventType != watch.Added {
		t.Errorf("Expected first event for newly-created %s/%s to be Added, got %s",
			testNS, firstName, firstEventType)
	} else {
		t.Logf("Correctly received watch.Added for first-seen UID")
	}

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3", testKind, testNS, testName)
}

type gracefulDeleteTestObject struct {
	APIVersion string `json:"apiVersion"`
	Kind       string `json:"kind"`
	Metadata   struct {
		Name              string   `json:"name"`
		Namespace         string   `json:"namespace"`
		UID               string   `json:"uid"`
		ResourceVersion   string   `json:"resourceVersion,omitempty"`
		Finalizers        []string `json:"finalizers,omitempty"`
		DeletionTimestamp *string  `json:"deletionTimestamp,omitempty"`
	} `json:"metadata"`
	Spec map[string]interface{} `json:"spec,omitempty"`
}

func (t *gracefulDeleteTestObject) GetObjectKind() schema.ObjectKind { return schema.EmptyObjectKind }

func (t *gracefulDeleteTestObject) DeepCopyObject() runtime.Object {
	data, _ := json.Marshal(t)
	c := &gracefulDeleteTestObject{}
	_ = json.Unmarshal(data, c)
	return c
}

func TestGracefulDeletion_DeletionTimestampPersistence_Integration(t *testing.T) {
	cfg := testConfig(t)

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()
	backend.StartWALConsumer()

	ctx := context.Background()
	testName := "graceful-delete-resource"
	testNS := "integration-test"
	testKind := "TestResource"

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3", testKind, testNS, testName)

	obj := &integrationTestObject{
		APIVersion: "ark.mckinsey.com/v1alpha1",
		Kind:       testKind,
		Metadata: struct {
			Name            string            `json:"name"`
			Namespace       string            `json:"namespace"`
			UID             string            `json:"uid"`
			ResourceVersion string            `json:"resourceVersion,omitempty"`
			Labels          map[string]string `json:"labels,omitempty"`
		}{
			Name:      testName,
			Namespace: testNS,
			UID:       "test-uid-graceful",
		},
		Spec: map[string]interface{}{"k": "v"},
	}
	if err := backend.Create(ctx, testKind, testNS, testName, obj); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	deletionTimestamp := func() *string {
		var ts sql.NullTime
		_ = backend.db.QueryRowContext(ctx,
			"SELECT deletion_timestamp FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3 AND deleted_at IS NULL",
			testKind, testNS, testName).Scan(&ts)
		if !ts.Valid {
			return nil
		}
		formatted := ts.Time.UTC().Format(time.RFC3339)
		return &formatted
	}
	currentRV := func() string {
		got, getErr := backend.Get(ctx, testKind, testNS, testName)
		if getErr != nil {
			t.Fatalf("Get failed: %v", getErr)
		}
		return got.(*integrationTestObject).Metadata.ResourceVersion
	}

	if dt := deletionTimestamp(); dt != nil {
		t.Fatalf("expected no deletion_timestamp on fresh resource, got %v", *dt)
	}

	// Mark for deletion: set deletionTimestamp while a finalizer is present.
	ts := "2026-01-02T15:04:05Z"
	markObj := &gracefulDeleteTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: testKind}
	markObj.Metadata.Name = testName
	markObj.Metadata.Namespace = testNS
	markObj.Metadata.UID = "test-uid-graceful"
	markObj.Metadata.ResourceVersion = currentRV()
	markObj.Metadata.Finalizers = []string{"ark.mckinsey.com/finalizer"}
	markObj.Metadata.DeletionTimestamp = &ts
	if err := backend.Update(ctx, testKind, testNS, testName, markObj); err != nil {
		t.Fatalf("Update marking deletion failed: %v", err)
	}

	if dt := deletionTimestamp(); dt == nil {
		t.Fatal("expected deletion_timestamp to be persisted after marking deletion")
	}

	// Remove the finalizer without resending deletionTimestamp: COALESCE must keep it.
	clearObj := &gracefulDeleteTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: testKind}
	clearObj.Metadata.Name = testName
	clearObj.Metadata.Namespace = testNS
	clearObj.Metadata.UID = "test-uid-graceful"
	clearObj.Metadata.ResourceVersion = currentRV()
	clearObj.Metadata.Finalizers = nil
	clearObj.Metadata.DeletionTimestamp = nil
	if err := backend.Update(ctx, testKind, testNS, testName, clearObj); err != nil {
		t.Fatalf("Update clearing finalizer failed: %v", err)
	}

	if dt := deletionTimestamp(); dt == nil {
		t.Error("expected deletion_timestamp to be preserved by COALESCE after an update that omitted it")
	}

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3", testKind, testNS, testName)
}

// TestList_PaginationSnapshotConsistency_Integration reproduces the BIGSERIAL
// commit-order race by holding an INSERT in-flight across page 1 and asserting
// its row does not leak below the cursor once it commits.
func TestList_PaginationSnapshotConsistency_Integration(t *testing.T) {
	cfg := testConfig(t)

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()
	backend.StartWALConsumer()

	ctx := context.Background()
	testKind := "PaginationTestResource"
	testNS := "pagination-integration"

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2", testKind, testNS)
	defer func() {
		_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2", testKind, testNS)
	}()

	newObj := func(name string, idx int) *integrationTestObject {
		obj := &integrationTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: testKind}
		obj.Metadata.Name = name
		obj.Metadata.Namespace = testNS
		obj.Metadata.UID = "uid-" + name
		obj.Spec = map[string]interface{}{"idx": idx}
		return obj
	}

	for i := 1; i <= 10; i++ {
		name := fmt.Sprintf("seed-%02d", i)
		if err := backend.Create(ctx, testKind, testNS, name, newObj(name, i)); err != nil {
			t.Fatalf("seed Create %s failed: %v", name, err)
		}
	}

	tx, err := backend.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("BeginTx failed: %v", err)
	}
	txCommitted := false
	defer func() {
		if !txCommitted {
			_ = tx.Rollback()
		}
	}()

	var inflightRV int64
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO resources (kind, namespace, name, uid, spec, status, labels, annotations, finalizers, owner_references)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb)
		RETURNING resource_version
	`, testKind, testNS, "in-flight-model", "uid-in-flight",
		`{"idx":11}`, `{}`, `{}`, `{}`, `[]`, `[]`).Scan(&inflightRV); err != nil {
		t.Fatalf("in-flight INSERT failed: %v", err)
	}

	// Push page 1's cursor above inflightRV so cursor-only pagination would
	// leak the row into a later page once it commits.
	for i := 1; i <= 20; i++ {
		name := fmt.Sprintf("post-%02d", i)
		if err := backend.Create(ctx, testKind, testNS, name, newObj(name, 100+i)); err != nil {
			t.Fatalf("post Create %s failed: %v", name, err)
		}
	}

	objs, contToken, page1RV, err := backend.List(ctx, testKind, testNS, storage.ListOptions{Limit: 5})
	if err != nil {
		t.Fatalf("page 1 List failed: %v", err)
	}
	if page1RV <= 0 {
		t.Fatalf("page 1 List returned non-positive listRV %d", page1RV)
	}
	if len(objs) != 5 {
		t.Fatalf("page 1: got %d rows, want 5", len(objs))
	}
	if contToken == "" {
		t.Fatalf("page 1: expected continue token, got empty")
	}
	cursor, err := decodeCursorForTest(contToken)
	if err != nil {
		t.Fatalf("decode continue token %q: %v", contToken, err)
	}
	if cursor <= inflightRV {
		t.Fatalf("page 1 cursor %d must be > inflightRV %d to reproduce the race", cursor, inflightRV)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("in-flight Commit failed: %v", err)
	}
	txCommitted = true

	seen := map[string]bool{}
	for _, o := range objs {
		seen[o.(*integrationTestObject).Metadata.Name] = true
	}
	for contToken != "" {
		var page []runtime.Object
		var pageRV int64
		page, contToken, pageRV, err = backend.List(ctx, testKind, testNS, storage.ListOptions{Limit: 5, Continue: contToken})
		if err != nil {
			t.Fatalf("subsequent List failed: %v", err)
		}
		// The list resourceVersion is pinned to page 1's head and carried in the
		// continue token, so every page reports the same value.
		if pageRV != page1RV {
			t.Errorf("paginated list RV drifted: page1=%d, later page=%d", page1RV, pageRV)
		}
		for _, o := range page {
			seen[o.(*integrationTestObject).Metadata.Name] = true
		}
	}

	if seen["in-flight-model"] {
		t.Errorf("pagination returned in-flight-model (rv=%d) even though it committed after page 1 — snapshot-consistent pagination must exclude it", inflightRV)
	}
	if len(seen) != 30 {
		t.Errorf("expected 30 rows across all pages (10 seed + 20 post), got %d: %v", len(seen), seen)
	}

	// A fresh LIST captures a new snapshot that now sees the committed row —
	// pinning to page 1's snapshot must not permanently hide it.
	reListSeen := map[string]bool{}
	var reListToken string
	for {
		var page []runtime.Object
		page, reListToken, _, err = backend.List(ctx, testKind, testNS, storage.ListOptions{Limit: 5, Continue: reListToken})
		if err != nil {
			t.Fatalf("re-List failed: %v", err)
		}
		for _, o := range page {
			reListSeen[o.(*integrationTestObject).Metadata.Name] = true
		}
		if reListToken == "" {
			break
		}
	}
	if !reListSeen["in-flight-model"] {
		t.Errorf("re-List after commit did not return in-flight-model (rv=%d) — pinned snapshot must not persist across calls", inflightRV)
	}
	if len(reListSeen) != 31 {
		t.Errorf("re-List: expected 31 rows (10 seed + 20 post + in-flight), got %d: %v", len(reListSeen), reListSeen)
	}
}

func decodeCursorForTest(token string) (int64, error) {
	if n, err := strconv.ParseInt(token, 10, 64); err == nil {
		return n, nil
	}
	decoded, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return 0, fmt.Errorf("token is neither int nor base64: %w", err)
	}
	var payload struct {
		Cursor int64 `json:"c"`
	}
	if err := json.Unmarshal(decoded, &payload); err != nil {
		return 0, fmt.Errorf("decoded token %q not JSON: %w", string(decoded), err)
	}
	return payload.Cursor, nil
}

func TestGenerationOnlyBumpsOnSpecChange_Integration(t *testing.T) {
	cfg := testConfig(t)

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()
	backend.StartWALConsumer()

	ctx := context.Background()
	testKind := "TestResource"
	testNS := "integration-test-generation"
	testName := "generation-test-resource"

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3", testKind, testNS, testName)
	defer func() {
		_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3", testKind, testNS, testName)
	}()

	generation := func() int64 {
		var g int64
		if err := backend.db.QueryRowContext(ctx,
			"SELECT generation FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3 AND deleted_at IS NULL",
			testKind, testNS, testName).Scan(&g); err != nil {
			t.Fatalf("read generation: %v", err)
		}
		return g
	}
	currentObj := func() *integrationTestObject {
		got, gerr := backend.Get(ctx, testKind, testNS, testName)
		if gerr != nil {
			t.Fatalf("Get failed: %v", gerr)
		}
		return got.(*integrationTestObject)
	}

	// Start with a two-key spec so we can test reordered-keys without needing
	// an intermediate spec change first.
	obj := &integrationTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: testKind}
	obj.Metadata.Name = testName
	obj.Metadata.Namespace = testNS
	obj.Metadata.UID = "gen-test-uid"
	obj.Metadata.Labels = map[string]string{"tier": "a"}
	obj.Spec = map[string]interface{}{"a": "1", "b": "2"}
	if err := backend.Create(ctx, testKind, testNS, testName, obj); err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if g := generation(); g != 1 {
		t.Fatalf("after Create: generation = %d, want 1", g)
	}

	// Metadata-only (label change): no bump.
	step := currentObj()
	step.Metadata.Labels = map[string]string{"tier": "b"}
	if err := backend.Update(ctx, testKind, testNS, testName, step); err != nil {
		t.Fatalf("label-only Update failed: %v", err)
	}
	if g := generation(); g != 1 {
		t.Errorf("after label-only update: generation = %d, want 1", g)
	}

	// Reordered spec keys: same content, no bump (jsonb structural equality).
	step = currentObj()
	step.Spec = map[string]interface{}{"b": "2", "a": "1"}
	if err := backend.Update(ctx, testKind, testNS, testName, step); err != nil {
		t.Fatalf("reordered-key Update failed: %v", err)
	}
	if g := generation(); g != 1 {
		t.Errorf("after reordered-key update: generation = %d, want 1 (jsonb equality is order-independent)", g)
	}

	// Actual spec change: bump.
	step = currentObj()
	step.Spec["a"] = "changed"
	if err := backend.Update(ctx, testKind, testNS, testName, step); err != nil {
		t.Fatalf("spec Update failed: %v", err)
	}
	if g := generation(); g != 2 {
		t.Errorf("after spec change: generation = %d, want 2", g)
	}

	// UpdateStatus: no bump.
	step = currentObj()
	step.Status = map[string]interface{}{"phase": "Ready"}
	if err := backend.UpdateStatus(ctx, testKind, testNS, testName, step); err != nil {
		t.Fatalf("UpdateStatus failed: %v", err)
	}
	if g := generation(); g != 2 {
		t.Errorf("after status update: generation = %d, want 2", g)
	}

	// Status + label via Update (whole-object round-trip, no spec change): no bump.
	step = currentObj()
	step.Metadata.Labels["extra"] = "value"
	step.Status["phase"] = "Running"
	if err := backend.Update(ctx, testKind, testNS, testName, step); err != nil {
		t.Fatalf("status+label Update failed: %v", err)
	}
	if g := generation(); g != 2 {
		t.Errorf("after status+label update: generation = %d, want 2", g)
	}

	// First graceful-deletion marking (DT null → non-null) bumps generation,
	// matching upstream rest.BeforeDelete.
	step = currentObj()
	ts := "2026-01-02T15:04:05Z"
	mark := &gracefulDeleteTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: testKind}
	mark.Metadata.Name = testName
	mark.Metadata.Namespace = testNS
	mark.Metadata.UID = step.Metadata.UID
	mark.Metadata.ResourceVersion = step.Metadata.ResourceVersion
	mark.Metadata.Finalizers = []string{"ark.mckinsey.com/finalizer"}
	mark.Metadata.DeletionTimestamp = &ts
	mark.Spec = step.Spec
	if err := backend.Update(ctx, testKind, testNS, testName, mark); err != nil {
		t.Fatalf("deletion-marking Update failed: %v", err)
	}
	if g := generation(); g != 3 {
		t.Errorf("after first deletion mark: generation = %d, want 3", g)
	}

	// Re-sending the timestamp on an already-marked row (same spec) does not bump.
	var rv string
	if err := backend.db.QueryRowContext(ctx,
		"SELECT resource_version FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3 AND deleted_at IS NULL",
		testKind, testNS, testName).Scan(&rv); err != nil {
		t.Fatalf("read rv after mark: %v", err)
	}
	resend := &gracefulDeleteTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: testKind}
	resend.Metadata.Name = testName
	resend.Metadata.Namespace = testNS
	resend.Metadata.UID = step.Metadata.UID
	resend.Metadata.ResourceVersion = rv
	resend.Metadata.Finalizers = []string{"ark.mckinsey.com/finalizer"}
	resend.Metadata.DeletionTimestamp = &ts
	resend.Spec = step.Spec
	if err := backend.Update(ctx, testKind, testNS, testName, resend); err != nil {
		t.Fatalf("resend-DT Update failed: %v", err)
	}
	if g := generation(); g != 3 {
		t.Errorf("after re-sending existing DT: generation = %d, want 3 (no bump)", g)
	}
}

// TestWatchResumeFromResourceVersion_Integration asserts item 1 of #2680: a watch
// opened with a concrete resourceVersion does not re-list the whole table on
// (re)connect. Resume re-emits at most a lookback window below the resume point (so
// out-of-order commits self-heal); objects older than that window are never
// replayed. The pre-existing objects here are pushed well below the window to prove
// that guarantee.
func TestWatchResumeFromResourceVersion_Integration(t *testing.T) {
	cfg := testConfig(t)

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()
	backend.StartWALConsumer()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	testNS := "integration-test"
	testKind := "ResumeTestResource"

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2", testKind, testNS)

	mkObj := func(name, uid string) *integrationTestObject {
		obj := &integrationTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: testKind}
		obj.Metadata.Name = name
		obj.Metadata.Namespace = testNS
		obj.Metadata.UID = uid
		obj.Spec = map[string]interface{}{"k": "v"}
		return obj
	}

	// Old state: three objects created BEFORE the watch is opened.
	preexisting := []string{"resume-1", "resume-2", "resume-3"}
	for i, name := range preexisting {
		if err := backend.Create(ctx, testKind, testNS, name, mkObj(name, fmt.Sprintf("uid-%d", i+1))); err != nil {
			t.Fatalf("Create %s failed: %v", name, err)
		}
	}

	// Advance the global rv sequence past a full lookback window, then create an
	// anchor. The pre-existing objects now sit more than relistLookbackRVs below the
	// anchor's rv, so resuming from the anchor must not reach back to them.
	if _, err := backend.db.ExecContext(ctx,
		"SELECT nextval('resources_resource_version_seq') FROM generate_series(1, $1)",
		relistLookbackRVs+100); err != nil {
		t.Fatalf("advance rv sequence: %v", err)
	}
	if err := backend.Create(ctx, testKind, testNS, "resume-anchor", mkObj("resume-anchor", "uid-anchor")); err != nil {
		t.Fatalf("Create anchor failed: %v", err)
	}

	var baselineRV int64
	if err := backend.db.QueryRowContext(ctx,
		"SELECT COALESCE(MAX(resource_version), 0) FROM resources WHERE kind = $1 AND namespace = $2",
		testKind, testNS).Scan(&baselineRV); err != nil {
		t.Fatalf("read baseline resourceVersion: %v", err)
	}

	// Resume from the anchor: the three older pre-existing objects must NOT be replayed.
	w, err := backend.Watch(ctx, testKind, testNS, storage.WatchOptions{
		ResourceVersion: strconv.FormatInt(baselineRV, 10),
	})
	if err != nil {
		t.Fatalf("Watch failed: %v", err)
	}
	defer w.Stop()

	time.Sleep(500 * time.Millisecond)

	// A single change after the resume point — the only event we expect to see.
	const deltaName = "resume-4"
	if err := backend.Create(ctx, testKind, testNS, deltaName, mkObj(deltaName, "uid-4")); err != nil {
		t.Fatalf("Create %s failed: %v", deltaName, err)
	}

	// Relist emits in resource_version ASC order, so any replay of the pre-existing
	// objects would arrive before the delta. Collecting until the delta lands is
	// therefore sufficient to prove they were (not) replayed.
	deadline := time.After(10 * time.Second)
	seen := map[string]bool{}
	gotDelta := false
	for !gotDelta {
		select {
		case ev, ok := <-w.ResultChan():
			if !ok {
				t.Fatal("watch channel closed before delta arrived")
			}
			if ev.Type == watch.Bookmark {
				continue
			}
			obj, _ := ev.Object.(*integrationTestObject)
			if obj == nil {
				continue
			}
			seen[obj.Metadata.Name] = true
			if obj.Metadata.Name == deltaName {
				gotDelta = true
			}
		case <-deadline:
			t.Fatal("timeout waiting for delta event after resume")
		}
	}

	for _, name := range preexisting {
		if seen[name] {
			t.Errorf("resume from resourceVersion=%d replayed object %q that is older than the lookback window; expected only recent rows + deltas", baselineRV, name)
		}
	}

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2", testKind, testNS)
}

// TestWatchResumeDoesNotDropOutOfOrderCommit_Integration guards the resume boundary
// against the out-of-order-commit race that the relist() lookback exists to defend
// against. BIGSERIAL assigns resource_version at INSERT statement time but a row is
// only visible at commit time, so a lower rv can commit AFTER a higher one.
//
// Timeline the test forces deterministically:
//  1. txLost inserts "lost-row", taking the lower rv, and stays open (uncommitted).
//  2. txSeen inserts "seen-row", taking the higher rv, and commits.
//  3. A client that Listed here would see only seen-row and resume watch from its rv
//     (setListItems computes the list rv as the max over rows returned).
//  4. txLost commits: lost-row becomes visible with an rv BELOW the resume point.
//
// The broadcaster's lookback re-reads lost-row and fans it to the watcher, so the
// resume boundary must not silently discard it. A regression drops it at forwardRow
// (rv <= startRV) and it never self-heals — only a fresh List recovers it.
func TestWatchResumeDoesNotDropOutOfOrderCommit_Integration(t *testing.T) {
	withFastRelist(t, 500*time.Millisecond)

	cfg := testConfig(t)

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()
	backend.StartWALConsumer()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	testNS := "integration-test"
	testKind := "ResumeRaceResource"

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2", testKind, testNS)
	defer func() {
		_, _ = backend.db.ExecContext(context.Background(), "DELETE FROM resources WHERE kind = $1 AND namespace = $2", testKind, testNS)
	}()

	// insertTx inserts one row within tx and returns the rv the sequence assigned at
	// statement time. Defaults cover the remaining NOT NULL / JSONB columns.
	insertTx := func(tx *sql.Tx, name, uid string) int64 {
		t.Helper()
		var rv int64
		if err := tx.QueryRowContext(ctx,
			`INSERT INTO resources (kind, namespace, name, uid) VALUES ($1, $2, $3, $4) RETURNING resource_version`,
			testKind, testNS, name, uid).Scan(&rv); err != nil {
			t.Fatalf("insert %s: %v", name, err)
		}
		return rv
	}

	// Step 1: lost-row takes the lower rv but is held uncommitted.
	txLost, err := backend.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin txLost: %v", err)
	}
	lostCommitted := false
	defer func() {
		if !lostCommitted {
			_ = txLost.Rollback()
		}
	}()
	const lostName = "lost-row"
	rvLost := insertTx(txLost, lostName, "uid-lost")

	// Step 2: seen-row takes the higher rv and commits first.
	txSeen, err := backend.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin txSeen: %v", err)
	}
	rvSeen := insertTx(txSeen, "seen-row", "uid-seen")
	if err := txSeen.Commit(); err != nil {
		t.Fatalf("commit txSeen: %v", err)
	}
	if rvLost >= rvSeen {
		t.Fatalf("expected rvLost < rvSeen to model the race, got rvLost=%d rvSeen=%d", rvLost, rvSeen)
	}

	// Step 3: resume from seen-row's rv, exactly as a client that Listed here would.
	w, err := backend.Watch(ctx, testKind, testNS, storage.WatchOptions{
		ResourceVersion: strconv.FormatInt(rvSeen, 10),
	})
	if err != nil {
		t.Fatalf("Watch failed: %v", err)
	}
	defer w.Stop()

	// Block until the watcher's initial relist finishes, proven by the Bookmark it
	// emits immediately afterwards. This makes lost-row's invisibility during the
	// initial relist a guarantee (its txn is still open here) rather than a timing
	// bet: only after this do we commit it. The initial relist may replay seen-row
	// (it sits inside the lookback window); lost-row cannot appear here since it is
	// still uncommitted, so we simply drain until the bookmark.
	bookmarkDeadline := time.After(10 * time.Second)
	for {
		gotBookmark := false
		select {
		case ev, ok := <-w.ResultChan():
			if !ok {
				t.Fatal("watch channel closed before initial bookmark")
			}
			if ev.Type == watch.Bookmark {
				gotBookmark = true
			} else if obj, _ := ev.Object.(*integrationTestObject); obj != nil && obj.Metadata.Name == lostName {
				t.Fatalf("lost-row emitted before its txn committed (rv=%d) — impossible unless a dirty read occurred", rvLost)
			}
		case <-bookmarkDeadline:
			t.Fatal("timeout waiting for initial relist bookmark")
		}
		if gotBookmark {
			break
		}
	}

	// Step 4: lost-row commits with an rv below the resume point.
	if err := txLost.Commit(); err != nil {
		t.Fatalf("commit txLost: %v", err)
	}
	lostCommitted = true

	// Sentinel is created after the race resolves; its rv is above the resume point,
	// so it always streams through. Relist emits ascending by rv, so if lost-row is
	// going to be delivered at all it arrives no later than the sentinel — making the
	// sentinel a sound, deterministic stop condition.
	const sentinelName = "sentinel-row"
	sentinel := &integrationTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: testKind}
	sentinel.Metadata.Name = sentinelName
	sentinel.Metadata.Namespace = testNS
	sentinel.Metadata.UID = "uid-sentinel"
	sentinel.Spec = map[string]interface{}{"k": "v"}
	if err := backend.Create(ctx, testKind, testNS, sentinelName, sentinel); err != nil {
		t.Fatalf("Create sentinel failed: %v", err)
	}

	deadline := time.After(15 * time.Second)
	sawLost := false
	for {
		select {
		case ev, ok := <-w.ResultChan():
			if !ok {
				t.Fatal("watch channel closed before sentinel arrived")
			}
			if ev.Type == watch.Bookmark {
				continue
			}
			obj, _ := ev.Object.(*integrationTestObject)
			if obj == nil {
				continue
			}
			switch obj.Metadata.Name {
			case lostName:
				sawLost = true
			case sentinelName:
				if !sawLost {
					t.Fatalf("resume from resourceVersion=%d silently dropped out-of-order commit %q (rv=%d, below resume point); "+
						"the lookback window must floor at startRV-relistLookbackRVs, not at startRV", rvSeen, lostName, rvLost)
				}
				return
			}
		case <-deadline:
			t.Fatalf("timeout waiting for sentinel; sawLost=%v", sawLost)
		}
	}
}

func TestWatchTooOldResourceVersionExpired_Integration(t *testing.T) {
	cfg := testConfig(t)

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()
	backend.StartWALConsumer()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	testNS := "integration-test"
	testKind := "PurgeFloorTestResource"

	// Isolate from prior runs: the purge floor is a single shared row bumped with
	// GREATEST, so reset both the persisted value and the in-memory mirror.
	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2", testKind, testNS)
	_, _ = backend.db.ExecContext(ctx, "DELETE FROM storage_metadata WHERE key = 'watch_purge_floor'")
	backend.cachedPurgeFloor.Store(0)
	defer func() {
		_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2", testKind, testNS)
	}()

	obj := &integrationTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: testKind}
	obj.Metadata.Name = "purge-1"
	obj.Metadata.Namespace = testNS
	obj.Metadata.UID = "purge-uid-1"
	obj.Spec = map[string]interface{}{"k": "v"}
	if err := backend.Create(ctx, testKind, testNS, "purge-1", obj); err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if err := backend.Delete(ctx, testKind, testNS, "purge-1"); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	// The soft-delete leaves a tombstone at a bumped RV; that RV becomes the purge
	// floor once the janitor hard-deletes it. Capture it before it is gone.
	var tombstoneRV int64
	if err := backend.db.QueryRowContext(ctx,
		"SELECT COALESCE(MAX(resource_version), 0) FROM resources WHERE kind = $1 AND namespace = $2",
		testKind, testNS).Scan(&tombstoneRV); err != nil {
		t.Fatalf("read tombstone resourceVersion: %v", err)
	}

	// Age the tombstone past the retention window and run the janitor directly.
	if _, err := backend.db.ExecContext(ctx,
		"UPDATE resources SET deleted_at = NOW() - INTERVAL '10 minutes' WHERE kind = $1 AND namespace = $2",
		testKind, testNS); err != nil {
		t.Fatalf("age tombstone: %v", err)
	}
	backend.purgeExpired()

	floor := backend.cachedPurgeFloor.Load()
	if floor < tombstoneRV {
		t.Fatalf("purge floor %d did not advance to tombstone RV %d", floor, tombstoneRV)
	}

	// Resuming from before the floor is a lost-tombstone hazard: expect 410-equivalent.
	_, err = backend.Watch(ctx, testKind, testNS, storage.WatchOptions{
		ResourceVersion: strconv.FormatInt(floor-1, 10),
	})
	if !errors.Is(err, storage.ErrResourceExpired) {
		t.Fatalf("resume below floor: want ErrResourceExpired, got %v", err)
	}

	// Resuming exactly at the floor is still safe — the client holds the object at
	// floor, so only later deltas are owed.
	w, err := backend.Watch(ctx, testKind, testNS, storage.WatchOptions{
		ResourceVersion: strconv.FormatInt(floor, 10),
	})
	if err != nil {
		t.Fatalf("resume at floor should be allowed, got %v", err)
	}
	w.Stop()
}

// TestListWatchHandoffAbovePurgeFloor_Integration is the regression guard for the
// PR #3223 relist livelock: after a purge raises the global floor above a quiet
// kind's surviving objects, the List->Watch handoff a reflector performs must
// still resume cleanly. Before the fix the list RV was the per-kind item max
// (below the floor), so every resume 410'd and the reflector relisted forever.
// The backend now stamps the list RV with the store head (max item RV lifted to
// the floor), which is always at or above the floor.
func TestListWatchHandoffAbovePurgeFloor_Integration(t *testing.T) {
	cfg := testConfig(t)
	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer backend.Close()
	backend.StartWALConsumer()

	ctx := context.Background()
	ns := "handoff-floor"
	kind := "QuietKind"

	_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2", kind, ns)
	_, _ = backend.db.ExecContext(ctx, "DELETE FROM storage_metadata WHERE key = 'watch_purge_floor'")
	backend.cachedPurgeFloor.Store(0)
	defer func() {
		_, _ = backend.db.ExecContext(ctx, "DELETE FROM resources WHERE kind = $1 AND namespace = $2", kind, ns)
	}()

	mk := func(name, uid string) *integrationTestObject {
		o := &integrationTestObject{APIVersion: "ark.mckinsey.com/v1alpha1", Kind: kind}
		o.Metadata.Name = name
		o.Metadata.Namespace = ns
		o.Metadata.UID = uid
		o.Spec = map[string]interface{}{"k": "v"}
		return o
	}

	// Survivor object at a low RV — the only surviving object of this kind.
	if err := backend.Create(ctx, kind, ns, "survivor", mk("survivor", "uid-survivor")); err != nil {
		t.Fatalf("create survivor: %v", err)
	}

	// A newer object of the SAME kind, then deleted: its tombstone takes the
	// highest RV. Purging it raises the floor above the survivor's RV.
	if err := backend.Create(ctx, kind, ns, "churn", mk("churn", "uid-churn")); err != nil {
		t.Fatalf("create churn: %v", err)
	}
	if err := backend.Delete(ctx, kind, ns, "churn"); err != nil {
		t.Fatalf("delete churn: %v", err)
	}
	if _, err := backend.db.ExecContext(ctx,
		"UPDATE resources SET deleted_at = NOW() - INTERVAL '10 minutes' WHERE kind = $1 AND namespace = $2 AND name = 'churn'",
		kind, ns); err != nil {
		t.Fatalf("age tombstone: %v", err)
	}
	backend.purgeExpired()
	floor := backend.cachedPurgeFloor.Load()
	if floor <= 0 {
		t.Fatalf("expected a positive purge floor, got %d", floor)
	}

	// A populated quiet kind and an empty kind both resume from their list RV.
	// The empty kind exercises the "empty list still carries the head" path.
	for _, tc := range []struct {
		name      string
		listKind  string
		wantItems int
	}{
		{name: "populated quiet kind", listKind: kind, wantItems: 1},
		{name: "empty kind", listKind: "NeverWrittenKind", wantItems: 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			objs, _, listRV, err := backend.List(ctx, tc.listKind, ns, storage.ListOptions{})
			if err != nil {
				t.Fatalf("list: %v", err)
			}
			if len(objs) != tc.wantItems {
				t.Fatalf("list returned %d objects, want %d", len(objs), tc.wantItems)
			}
			// The whole point: the list RV is at or above the floor, so the resume
			// below cannot 410. A per-kind item max (the old behavior) would sit
			// below the floor for both a quiet survivor and an empty kind.
			if listRV < floor {
				t.Fatalf("list RV %d is below purge floor %d — resume would 410 and livelock", listRV, floor)
			}

			w, err := backend.Watch(ctx, tc.listKind, ns, storage.WatchOptions{
				ResourceVersion: strconv.FormatInt(listRV, 10),
			})
			if err != nil {
				t.Fatalf("watch resume from list RV %d rejected (floor %d): %v", listRV, floor, err)
			}
			w.Stop()
		})
	}
}
