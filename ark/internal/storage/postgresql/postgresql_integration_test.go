//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"

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
