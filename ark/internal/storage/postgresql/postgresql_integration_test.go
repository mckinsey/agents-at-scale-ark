//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
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
	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		t.Skip("POSTGRES_HOST not set, skipping integration test")
	}

	cfg := Config{
		Host:     host,
		Port:     5432,
		Database: "ark",
		User:     "ark",
		Password: os.Getenv("POSTGRES_PASSWORD"),
		SSLMode:  "disable",
	}

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()

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
	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		t.Skip("POSTGRES_HOST not set, skipping integration test")
	}

	cfg := Config{
		Host:     host,
		Port:     5432,
		Database: "ark",
		User:     "ark",
		Password: os.Getenv("POSTGRES_PASSWORD"),
		SSLMode:  "disable",
	}

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()

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
	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		t.Skip("POSTGRES_HOST not set, skipping integration test")
	}

	cfg := Config{
		Host:     host,
		Port:     5432,
		Database: "ark",
		User:     "ark",
		Password: os.Getenv("POSTGRES_PASSWORD"),
		SSLMode:  "disable",
	}

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()

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
	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		t.Skip("POSTGRES_HOST not set, skipping integration test")
	}

	cfg := Config{
		Host:     host,
		Port:     5432,
		Database: "ark",
		User:     "ark",
		Password: os.Getenv("POSTGRES_PASSWORD"),
		SSLMode:  "disable",
	}

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()

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
	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		t.Skip("POSTGRES_HOST not set, skipping integration test")
	}

	cfg := Config{
		Host:     host,
		Port:     5432,
		Database: "ark",
		User:     "ark",
		Password: os.Getenv("POSTGRES_PASSWORD"),
		SSLMode:  "disable",
	}

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()

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
	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		t.Skip("POSTGRES_HOST not set, skipping integration test")
	}

	cfg := Config{
		Host:     host,
		Port:     5432,
		Database: "ark",
		User:     "ark",
		Password: os.Getenv("POSTGRES_PASSWORD"),
		SSLMode:  "disable",
	}

	backend, err := New(cfg, &integrationMockConverter{})
	if err != nil {
		t.Fatalf("Failed to create backend: %v", err)
	}
	defer backend.Close()

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

	objs, contToken, err := backend.List(ctx, testKind, testNS, storage.ListOptions{Limit: 5})
	if err != nil {
		t.Fatalf("page 1 List failed: %v", err)
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
		page, contToken, err = backend.List(ctx, testKind, testNS, storage.ListOptions{Limit: 5, Continue: contToken})
		if err != nil {
			t.Fatalf("subsequent List failed: %v", err)
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
		page, reListToken, err = backend.List(ctx, testKind, testNS, storage.ListOptions{Limit: 5, Continue: reListToken})
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
