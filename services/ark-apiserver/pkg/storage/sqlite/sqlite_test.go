package sqlite

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark-apiserver/pkg/storage"
)

func setupTestBackend(t *testing.T) (*SQLiteBackend, func()) {
	t.Helper()
	tmpDir, err := os.MkdirTemp("", "ark-apiserver-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	dbPath := filepath.Join(tmpDir, "test.db")
	converter := storage.NewArkTypeConverter()
	backend, err := New(dbPath, converter)
	if err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("failed to create backend: %v", err)
	}

	cleanup := func() {
		backend.Close()
		os.RemoveAll(tmpDir)
	}

	return backend, cleanup
}

func TestCreateAndGet(t *testing.T) {
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

func TestList(t *testing.T) {
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

func TestUpdate(t *testing.T) {
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

func TestDelete(t *testing.T) {
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

func TestGetNotFound(t *testing.T) {
	backend, cleanup := setupTestBackend(t)
	defer cleanup()

	ctx := context.Background()
	_, err := backend.Get(ctx, "Query", "default", "nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent resource, got nil")
	}
}

func TestNamespaceIsolation(t *testing.T) {
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

func TestAgentCRUD(t *testing.T) {
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
	if got.Spec.ModelRef == nil || got.Spec.ModelRef.Name != "gpt-4" {
		t.Errorf("unexpected modelRef")
	}

	if err := backend.Delete(ctx, "Agent", "default", "test-agent"); err != nil {
		t.Fatalf("Delete Agent failed: %v", err)
	}

	_, err = backend.Get(ctx, "Agent", "default", "test-agent")
	if err == nil {
		t.Error("expected error after delete, got nil")
	}
}

func TestModelCRUD(t *testing.T) {
	backend, cleanup := setupTestBackend(t)
	defer cleanup()

	ctx := context.Background()
	model := &arkv1alpha1.Model{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Model",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-model",
			Namespace: "default",
			UID:       "model-uid-123",
		},
		Spec: arkv1alpha1.ModelSpec{
			Model:    arkv1alpha1.ValueSource{Value: "gpt-4-turbo"},
			Provider: "openai",
			Config: arkv1alpha1.ModelConfig{
				OpenAI: &arkv1alpha1.OpenAIModelConfig{
					BaseURL: arkv1alpha1.ValueSource{Value: "https://api.openai.com/v1"},
					APIKey:  arkv1alpha1.ValueSource{Value: "sk-test"},
				},
			},
		},
	}

	if err := backend.Create(ctx, "Model", "default", "test-model", model); err != nil {
		t.Fatalf("Create Model failed: %v", err)
	}

	obj, err := backend.Get(ctx, "Model", "default", "test-model")
	if err != nil {
		t.Fatalf("Get Model failed: %v", err)
	}

	got, ok := obj.(*arkv1alpha1.Model)
	if !ok {
		t.Fatalf("expected *Model, got %T", obj)
	}

	if got.Name != "test-model" {
		t.Errorf("expected name test-model, got %s", got.Name)
	}
	if got.Spec.Provider != "openai" {
		t.Errorf("expected provider openai, got %s", got.Spec.Provider)
	}
	if got.Spec.Model.Value != "gpt-4-turbo" {
		t.Errorf("expected model gpt-4-turbo, got %s", got.Spec.Model.Value)
	}

	objects, _, err := backend.List(ctx, "Model", "default", storage.ListOptions{})
	if err != nil {
		t.Fatalf("List Model failed: %v", err)
	}
	if len(objects) != 1 {
		t.Errorf("expected 1 model, got %d", len(objects))
	}
}

func TestConcurrentListRequests(t *testing.T) {
	backend, cleanup := setupTestBackend(t)
	defer cleanup()

	ctx := context.Background()

	for i := 0; i < 50; i++ {
		name := fmt.Sprintf("query-%d", i)
		query := &arkv1alpha1.Query{
			TypeMeta: metav1.TypeMeta{
				APIVersion: "ark.mckinsey.com/v1alpha1",
				Kind:       "Query",
			},
			ObjectMeta: metav1.ObjectMeta{
				Name:      name,
				Namespace: "default",
				UID:       types.UID(fmt.Sprintf("uid-%d", i)),
			},
		}
		if err := backend.Create(ctx, "Query", "default", name, query); err != nil {
			t.Fatalf("Create failed: %v", err)
		}
	}

	resourceTypes := []string{"Query", "Agent", "Model", "Team", "Tool", "Memory", "MCPServer", "Evaluation", "Evaluator", "A2ATask"}
	const concurrentRequests = 20
	errors := make(chan error, concurrentRequests)

	for i := 0; i < concurrentRequests; i++ {
		go func(idx int) {
			kind := resourceTypes[idx%len(resourceTypes)]
			_, _, err := backend.List(ctx, kind, "default", storage.ListOptions{})
			errors <- err
		}(i)
	}

	for i := 0; i < concurrentRequests; i++ {
		if err := <-errors; err != nil {
			t.Errorf("Concurrent list failed: %v", err)
		}
	}
}

func TestMultipleResourceTypes(t *testing.T) {
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
