/* Copyright 2025. McKinsey & Company */

package registry

import (
	"bytes"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"time"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/util/jsonpath"
)

const (
	cellNone  = "<none>"
	cellError = "<error>"
)

type PrinterColumn struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	JSONPath    string `json:"jsonPath"`
	Description string `json:"description,omitempty"`
	Priority    int32  `json:"priority,omitempty"`
}

type PrinterColumnRegistry struct {
	columns map[string][]PrinterColumn
}

func NewPrinterColumnRegistry() *PrinterColumnRegistry {
	return &PrinterColumnRegistry{
		columns: make(map[string][]PrinterColumn),
	}
}

func (r *PrinterColumnRegistry) Register(kind string, columns []PrinterColumn) {
	r.columns[kind] = columns
}

func (r *PrinterColumnRegistry) GetColumns(kind string) []PrinterColumn {
	return r.columns[kind]
}

func (r *PrinterColumnRegistry) EvaluateCell(column PrinterColumn, obj runtime.Object) interface{} {
	path := column.JSONPath
	if !strings.HasPrefix(path, "{") {
		path = "{" + path + "}"
	}

	jp := jsonpath.New(column.Name).AllowMissingKeys(true)
	if err := jp.Parse(path); err != nil {
		return cellError
	}

	var data interface{}
	raw, err := json.Marshal(obj)
	if err != nil {
		return cellError
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		return cellError
	}

	buf := new(bytes.Buffer)
	if err := jp.Execute(buf, data); err != nil {
		return cellNone
	}

	result := buf.String()
	if result == "" {
		return cellNone
	}

	return formatCellValue(result, column.Type)
}

func formatCellValue(value, colType string) interface{} {
	switch colType {
	case "integer":
		var i int64
		if _, err := fmt.Sscanf(value, "%d", &i); err == nil {
			return i
		}
		return value
	case "boolean":
		return strings.ToLower(value) == "true"
	case columnTypeDate:
		if t, err := time.Parse(time.RFC3339, value); err == nil {
			return t
		}
		return value
	default:
		return value
	}
}

func (r *PrinterColumnRegistry) EvaluateRow(kind string, obj runtime.Object) []interface{} {
	columns := r.GetColumns(kind)
	if len(columns) == 0 {
		return nil
	}

	cells := make([]interface{}, 0, len(columns)+1)

	accessor := reflect.ValueOf(obj).Elem().FieldByName("ObjectMeta")
	if accessor.IsValid() {
		name := accessor.FieldByName("Name")
		if name.IsValid() {
			cells = append(cells, name.String())
		} else {
			cells = append(cells, "<unknown>")
		}
	} else {
		cells = append(cells, "<unknown>")
	}

	for _, col := range columns {
		cells = append(cells, r.EvaluateCell(col, obj))
	}

	return cells
}
