/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"testing"
)

const colNameAge = "Age"

func TestGetPrinterColumnRegistry(t *testing.T) {
	reg := GetPrinterColumnRegistry()
	if reg == nil {
		t.Fatal("expected non-nil registry")
	}

	agentCols := reg.GetColumns("Agent")
	if len(agentCols) == 0 {
		t.Error("expected Agent to have printer columns")
	}

	hasModel := false
	hasAge := false
	for _, col := range agentCols {
		if col.Name == "Model" {
			hasModel = true
		}
		if col.Name == colNameAge {
			hasAge = true
		}
	}

	if !hasModel {
		t.Error("Agent should have 'Model' column")
	}
	if !hasAge {
		t.Error("Agent should have 'Age' column")
	}
}

func TestGetPrinterColumnRegistry_AllKinds(t *testing.T) {
	reg := GetPrinterColumnRegistry()

	kindsWithColumns := []string{
		"Agent", "Model", "Query", "Team", "Memory",
		"MCPServer", "Evaluation", "Evaluator", "A2ATask",
		"ExecutionEngine", "A2AServer",
	}

	for _, kind := range kindsWithColumns {
		cols := reg.GetColumns(kind)
		if len(cols) == 0 {
			t.Errorf("%s should have printer columns", kind)
		}

		hasAge := false
		for _, col := range cols {
			if col.Name == colNameAge {
				hasAge = true
				break
			}
		}
		if !hasAge {
			t.Errorf("%s should have 'Age' column", kind)
		}
	}

	toolCols := reg.GetColumns("Tool")
	if len(toolCols) != 0 {
		t.Logf("Tool has %d columns (optional)", len(toolCols))
	}
}

func TestGetPrinterColumnRegistry_ColumnTypes(t *testing.T) {
	reg := GetPrinterColumnRegistry()

	mcpCols := reg.GetColumns("MCPServer")
	for _, col := range mcpCols {
		if col.Name == "Tools" {
			if col.Type != "integer" {
				t.Errorf("MCPServer.Tools should be integer, got %s", col.Type)
			}
		}
		if col.Name == colNameAge {
			if col.Type != "date" {
				t.Errorf("MCPServer.Age should be date, got %s", col.Type)
			}
		}
	}
}
