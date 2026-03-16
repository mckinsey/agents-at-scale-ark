/* Copyright 2025. McKinsey & Company */

package registry

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestPrinterColumnRegistry_Register(t *testing.T) {
	t.Parallel()
	reg := NewPrinterColumnRegistry()
	columns := []PrinterColumn{
		{Name: "Model", Type: "string", JSONPath: ".spec.modelRef.name"},
		{Name: "Age", Type: "date", JSONPath: ".metadata.creationTimestamp"},
	}
	reg.Register("Agent", columns)

	got := reg.GetColumns("Agent")
	if len(got) != 2 {
		t.Errorf("expected 2 columns, got %d", len(got))
	}
}

func TestPrinterColumnRegistry_GetColumns_Unknown(t *testing.T) {
	t.Parallel()
	reg := NewPrinterColumnRegistry()
	got := reg.GetColumns("Unknown")
	if got != nil {
		t.Errorf("expected nil for unknown kind, got %v", got)
	}
}

func TestPrinterColumnRegistry_EvaluateCell_SimpleField(t *testing.T) {
	t.Parallel()
	reg := NewPrinterColumnRegistry()
	col := PrinterColumn{Name: "Model", Type: "string", JSONPath: ".spec.modelRef.name"}

	agent := &arkv1alpha1.Agent{
		Spec: arkv1alpha1.AgentSpec{
			ModelRef: &arkv1alpha1.AgentModelRef{Name: "gpt-4"},
		},
	}

	result := reg.EvaluateCell(col, agent)
	if result != "gpt-4" {
		t.Errorf("expected 'gpt-4', got %v", result)
	}
}

func TestPrinterColumnRegistry_EvaluateCell_MissingField(t *testing.T) {
	t.Parallel()
	reg := NewPrinterColumnRegistry()
	col := PrinterColumn{Name: "Model", Type: "string", JSONPath: ".spec.modelRef.name"}

	agent := &arkv1alpha1.Agent{}

	result := reg.EvaluateCell(col, agent)
	if result != cellNone {
		t.Errorf("expected '<none>' for missing field, got %v", result)
	}
}

func TestPrinterColumnRegistry_EvaluateCell_IntegerType(t *testing.T) {
	t.Parallel()
	reg := NewPrinterColumnRegistry()
	col := PrinterColumn{Name: "Tools", Type: "integer", JSONPath: ".status.toolCount"}

	mcp := &arkv1alpha1.MCPServer{
		Status: arkv1alpha1.MCPServerStatus{
			ToolCount: 5,
		},
	}

	result := reg.EvaluateCell(col, mcp)
	if result != int64(5) {
		t.Errorf("expected int64(5), got %v (%T)", result, result)
	}
}

func TestPrinterColumnRegistry_EvaluateCell_DateType(t *testing.T) {
	t.Parallel()
	reg := NewPrinterColumnRegistry()
	col := PrinterColumn{Name: "Age", Type: "date", JSONPath: ".metadata.creationTimestamp"}

	agent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{
			CreationTimestamp: metav1.Now(),
		},
	}

	result := reg.EvaluateCell(col, agent)
	if result == cellNone || result == cellError {
		t.Errorf("expected valid time, got %v", result)
	}
}

func TestGenericStorage_ConvertToTable_WithPrinterColumns(t *testing.T) {
	t.Parallel()

	printerReg := NewPrinterColumnRegistry()
	printerReg.Register("Agent", []PrinterColumn{
		{Name: "Model", Type: "string", JSONPath: ".spec.modelRef.name"},
		{Name: "Age", Type: "date", JSONPath: ".metadata.creationTimestamp"},
	})

	backend := newMockBackend()
	config := ResourceConfig{
		Kind:         "Agent",
		Resource:     "agents",
		SingularName: "agent",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.Agent{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.AgentList{} },
	}
	gs := NewGenericStorage(backend, &mockConverter{}, config, printerReg)

	agent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "test-agent",
			CreationTimestamp: metav1.Now(),
		},
		Spec: arkv1alpha1.AgentSpec{
			ModelRef: &arkv1alpha1.AgentModelRef{Name: "gpt-4"},
		},
	}

	table, err := gs.ConvertToTable(context.Background(), agent, nil)
	if err != nil {
		t.Fatalf("ConvertToTable() error = %v", err)
	}

	if len(table.ColumnDefinitions) != 3 {
		t.Errorf("expected 3 columns (Name + 2 printer columns), got %d", len(table.ColumnDefinitions))
	}

	expectedCols := []string{"Name", "Model", "Age"}
	for i, col := range table.ColumnDefinitions {
		if col.Name != expectedCols[i] {
			t.Errorf("column %d: expected %q, got %q", i, expectedCols[i], col.Name)
		}
	}

	if len(table.Rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(table.Rows))
	}

	row := table.Rows[0]
	if len(row.Cells) != 3 {
		t.Errorf("expected 3 cells, got %d", len(row.Cells))
	}
	if row.Cells[0] != "test-agent" {
		t.Errorf("expected name 'test-agent', got %v", row.Cells[0])
	}
	if row.Cells[1] != "gpt-4" {
		t.Errorf("expected model 'gpt-4', got %v", row.Cells[1])
	}
}
