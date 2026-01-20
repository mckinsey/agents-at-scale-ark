package postgresql

import (
	"context"
	"fmt"
	"os"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark-apiserver/pkg/storage"
)

func getTestConfig() *Config {
	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		return nil
	}

	return &Config{
		Host:     host,
		Port:     5432,
		Database: os.Getenv("POSTGRES_DB"),
		User:     os.Getenv("POSTGRES_USER"),
		Password: os.Getenv("POSTGRES_PASSWORD"),
		SSLMode:  "disable",
	}
}

func setupTestBackend(t *testing.T) (*PostgreSQLBackend, func()) {
	t.Helper()

	cfg := getTestConfig()
	if cfg == nil {
		t.Skip("PostgreSQL not configured (set POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD)")
	}

	converter := storage.NewArkTypeConverter()
	backend, err := New(*cfg, converter)
	if err != nil {
		t.Fatalf("failed to create backend: %v", err)
	}

	ctx := context.Background()
	_, err = backend.db.ExecContext(ctx, "DELETE FROM resources")
	if err != nil {
		backend.Close()
		t.Fatalf("failed to clean database: %v", err)
	}

	cleanup := func() {
		backend.db.ExecContext(context.Background(), "DELETE FROM resources")
		backend.Close()
	}

	return backend, cleanup
}

func TestPostgreSQLCreateAndGet(t *testing.T) {
	backend, cleanup := setupTestBackend(t)
	defer cleanup()

	ctx := context.Background()
	query := &arkv1alpha1.Query{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Query",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: "default",
			UID:       "test-uid-123",
		},
		Spec: arkv1alpha1.QuerySpec{
			Type: "chat",
		},
	}

	err := backend.Create(ctx, "Query", "default", "test-query", query)
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	obj, err := backend.Get(ctx, "Query", "default", "test-query")
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}

	got, ok := obj.(*arkv1alpha1.Query)
	if !ok {
		t.Fatalf("expected *Query, got %T", obj)
	}

	if got.Name != "test-query" {
		t.Errorf("expected name test-query, got %s", got.Name)
	}
	if got.Spec.Type != "chat" {
		t.Errorf("expected type chat, got %s", got.Spec.Type)
	}
}

func TestPostgreSQLList(t *testing.T) {
	backend, cleanup := setupTestBackend(t)
	defer cleanup()

	ctx := context.Background()

	for i := 0; i < 3; i++ {
		name := fmt.Sprintf("test-query-%d", i)
		query := &arkv1alpha1.Query{
			TypeMeta: metav1.TypeMeta{
				APIVersion: "ark.mckinsey.com/v1alpha1",
				Kind:       "Query",
			},
			ObjectMeta: metav1.ObjectMeta{
				Name:      name,
				Namespace: "default",
				UID:       types.UID(fmt.Sprintf("test-uid-%d", i)),
			},
			Spec: arkv1alpha1.QuerySpec{
				Type: "chat",
			},
		}
		if err := backend.Create(ctx, "Query", "default", query.Name, query); err != nil {
			t.Fatalf("Create failed: %v", err)
		}
	}

	objects, _, err := backend.List(ctx, "Query", "default", storage.ListOptions{})
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}

	if len(objects) != 3 {
		t.Errorf("expected 3 objects, got %d", len(objects))
	}
}

func TestPostgreSQLUpdate(t *testing.T) {
	backend, cleanup := setupTestBackend(t)
	defer cleanup()

	ctx := context.Background()
	query := &arkv1alpha1.Query{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Query",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: "default",
			UID:       "test-uid-123",
		},
		Spec: arkv1alpha1.QuerySpec{
			Type: "chat",
		},
	}

	if err := backend.Create(ctx, "Query", "default", "test-query", query); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	query.Spec.Type = "completion"
	if err := backend.Update(ctx, "Query", "default", "test-query", query); err != nil {
		t.Fatalf("Update failed: %v", err)
	}

	obj, err := backend.Get(ctx, "Query", "default", "test-query")
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}

	got := obj.(*arkv1alpha1.Query)
	if got.Spec.Type != "completion" {
		t.Errorf("expected type completion, got %s", got.Spec.Type)
	}
}

func TestPostgreSQLDelete(t *testing.T) {
	backend, cleanup := setupTestBackend(t)
	defer cleanup()

	ctx := context.Background()
	query := &arkv1alpha1.Query{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Query",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: "default",
			UID:       "test-uid-123",
		},
		Spec: arkv1alpha1.QuerySpec{
			Type: "chat",
		},
	}

	if err := backend.Create(ctx, "Query", "default", "test-query", query); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	if err := backend.Delete(ctx, "Query", "default", "test-query"); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	_, err := backend.Get(ctx, "Query", "default", "test-query")
	if err == nil {
		t.Error("expected error after delete, got nil")
	}
}

func TestPostgreSQLSoftDelete(t *testing.T) {
	backend, cleanup := setupTestBackend(t)
	defer cleanup()

	ctx := context.Background()
	query := &arkv1alpha1.Query{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Query",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: "default",
			UID:       "test-uid-123",
		},
	}

	if err := backend.Create(ctx, "Query", "default", "test-query", query); err != nil {
		t.Fatalf("Create failed: %v", err)
	}

	if err := backend.Delete(ctx, "Query", "default", "test-query"); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	var count int
	err := backend.db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM resources WHERE kind = 'Query' AND name = 'test-query' AND deleted_at IS NOT NULL",
	).Scan(&count)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}
	if count != 1 {
		t.Errorf("expected soft-deleted record to exist, got count %d", count)
	}
}

func TestPostgreSQLGetNotFound(t *testing.T) {
	backend, cleanup := setupTestBackend(t)
	defer cleanup()

	ctx := context.Background()
	_, err := backend.Get(ctx, "Query", "default", "nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent resource, got nil")
	}
}

func TestPostgreSQLNamespaceIsolation(t *testing.T) {
	backend, cleanup := setupTestBackend(t)
	defer cleanup()

	ctx := context.Background()

	query1 := &arkv1alpha1.Query{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Query",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: "ns1",
			UID:       "uid-1",
		},
	}
	query2 := &arkv1alpha1.Query{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Query",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-query",
			Namespace: "ns2",
			UID:       "uid-2",
		},
	}

	if err := backend.Create(ctx, "Query", "ns1", "test-query", query1); err != nil {
		t.Fatalf("Create ns1 failed: %v", err)
	}
	if err := backend.Create(ctx, "Query", "ns2", "test-query", query2); err != nil {
		t.Fatalf("Create ns2 failed: %v", err)
	}

	objects1, _, _ := backend.List(ctx, "Query", "ns1", storage.ListOptions{})
	objects2, _, _ := backend.List(ctx, "Query", "ns2", storage.ListOptions{})

	if len(objects1) != 1 {
		t.Errorf("expected 1 object in ns1, got %d", len(objects1))
	}
	if len(objects2) != 1 {
		t.Errorf("expected 1 object in ns2, got %d", len(objects2))
	}
}

func TestPostgreSQLAgentCRUD(t *testing.T) {
	backend, cleanup := setupTestBackend(t)
	defer cleanup()

	ctx := context.Background()
	agent := &arkv1alpha1.Agent{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Agent",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-agent",
			Namespace: "default",
			UID:       "agent-uid-123",
		},
		Spec: arkv1alpha1.AgentSpec{
			Prompt:      "You are a helpful assistant.",
			Description: "Test agent",
			ModelRef: &arkv1alpha1.AgentModelRef{
				Name: "gpt-4",
			},
		},
	}

	if err := backend.Create(ctx, "Agent", "default", "test-agent", agent); err != nil {
		t.Fatalf("Create Agent failed: %v", err)
	}

	obj, err := backend.Get(ctx, "Agent", "default", "test-agent")
	if err != nil {
		t.Fatalf("Get Agent failed: %v", err)
	}

	got, ok := obj.(*arkv1alpha1.Agent)
	if !ok {
		t.Fatalf("expected *Agent, got %T", obj)
	}

	if got.Name != "test-agent" {
		t.Errorf("expected name test-agent, got %s", got.Name)
	}
	if got.Spec.Prompt != "You are a helpful assistant." {
		t.Errorf("unexpected prompt: %s", got.Spec.Prompt)
	}

	if err := backend.Delete(ctx, "Agent", "default", "test-agent"); err != nil {
		t.Fatalf("Delete Agent failed: %v", err)
	}

	_, err = backend.Get(ctx, "Agent", "default", "test-agent")
	if err == nil {
		t.Error("expected error after delete, got nil")
	}
}

func TestPostgreSQLMultipleResourceTypes(t *testing.T) {
	backend, cleanup := setupTestBackend(t)
	defer cleanup()

	ctx := context.Background()

	query := &arkv1alpha1.Query{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Query",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test",
			Namespace: "default",
			UID:       "query-uid",
		},
	}
	agent := &arkv1alpha1.Agent{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Agent",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test",
			Namespace: "default",
			UID:       "agent-uid",
		},
	}
	model := &arkv1alpha1.Model{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Model",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test",
			Namespace: "default",
			UID:       "model-uid",
		},
		Spec: arkv1alpha1.ModelSpec{
			Provider: "openai",
		},
	}

	if err := backend.Create(ctx, "Query", "default", "test", query); err != nil {
		t.Fatalf("Create Query failed: %v", err)
	}
	if err := backend.Create(ctx, "Agent", "default", "test", agent); err != nil {
		t.Fatalf("Create Agent failed: %v", err)
	}
	if err := backend.Create(ctx, "Model", "default", "test", model); err != nil {
		t.Fatalf("Create Model failed: %v", err)
	}

	queries, _, _ := backend.List(ctx, "Query", "default", storage.ListOptions{})
	agents, _, _ := backend.List(ctx, "Agent", "default", storage.ListOptions{})
	models, _, _ := backend.List(ctx, "Model", "default", storage.ListOptions{})

	if len(queries) != 1 {
		t.Errorf("expected 1 query, got %d", len(queries))
	}
	if len(agents) != 1 {
		t.Errorf("expected 1 agent, got %d", len(agents))
	}
	if len(models) != 1 {
		t.Errorf("expected 1 model, got %d", len(models))
	}
}
