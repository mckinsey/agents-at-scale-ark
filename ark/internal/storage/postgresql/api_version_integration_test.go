//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"testing"
)

// TestAPIVersionColumn_SetOnWrite verifies the storage-version marker added by
// migration 00002 is populated when a resource is created.
func TestAPIVersionColumn_SetOnWrite(t *testing.T) {
	backend, err := New(testConfig(t), &integrationMockConverter{})
	if err != nil {
		t.Fatalf("create backend: %v", err)
	}
	t.Cleanup(func() { _ = backend.Close() })

	ctx := context.Background()
	const kind, ns, name = "Agent", "apiver-ns", "a1"
	if err := backend.Create(ctx, kind, ns, name, nil); err != nil {
		t.Fatalf("create: %v", err)
	}
	t.Cleanup(func() { _, _ = backend.db.Exec("DELETE FROM resources WHERE namespace = $1", ns) })

	var apiVersion string
	err = backend.db.QueryRowContext(ctx,
		"SELECT api_version FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3",
		kind, ns, name).Scan(&apiVersion)
	if err != nil {
		t.Fatalf("read api_version: %v", err)
	}
	want := backend.converter.APIVersion(kind)
	if apiVersion != want {
		t.Errorf("api_version = %q, want %q", apiVersion, want)
	}
}

// TestSchemaVersionRecorded verifies migrations record the expected version.
func TestSchemaVersionRecorded(t *testing.T) {
	backend, err := New(testConfig(t), &integrationMockConverter{})
	if err != nil {
		t.Fatalf("create backend: %v", err)
	}
	t.Cleanup(func() { _ = backend.Close() })

	var version int64
	if err := backend.db.QueryRowContext(context.Background(),
		"SELECT max(version_id) FROM "+gooseVersionTable).Scan(&version); err != nil {
		t.Fatalf("read schema version: %v", err)
	}
	if version != expectedSchemaVersion {
		t.Errorf("recorded schema version = %d, want %d", version, expectedSchemaVersion)
	}
}
