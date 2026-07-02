/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"database/sql/driver"
	"errors"
	"reflect"
	"testing"

	"github.com/lib/pq"
	"mckinsey.com/ark/internal/storage"
)

func TestParseFieldSelector_Supported(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		selector  string
		wantPreds []fieldPredicate
	}{
		{
			name:      "empty selector returns no predicates",
			selector:  "",
			wantPreds: nil,
		},
		{
			name:     "metadata.name equality",
			selector: "metadata.name=my-agent",
			wantPreds: []fieldPredicate{
				{column: "name", op: "=", value: "my-agent"},
			},
		},
		{
			name:     "metadata.name double-equals",
			selector: "metadata.name==my-agent",
			wantPreds: []fieldPredicate{
				{column: "name", op: "=", value: "my-agent"},
			},
		},
		{
			name:     "metadata.name inequality",
			selector: "metadata.name!=my-agent",
			wantPreds: []fieldPredicate{
				{column: "name", op: "<>", value: "my-agent"},
			},
		},
		{
			name:     "metadata.namespace equality",
			selector: "metadata.namespace=prod",
			wantPreds: []fieldPredicate{
				{column: "namespace", op: "=", value: "prod"},
			},
		},
		{
			name:     "combined name and namespace",
			selector: "metadata.name=foo,metadata.namespace=prod",
			wantPreds: []fieldPredicate{
				{column: "name", op: "=", value: "foo"},
				{column: "namespace", op: "=", value: "prod"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			preds, err := parseFieldSelector(tt.selector)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(preds, tt.wantPreds) {
				t.Errorf("preds = %+v, want %+v", preds, tt.wantPreds)
			}
		})
	}
}

func TestParseFieldSelector_Rejects(t *testing.T) {
	t.Parallel()

	for _, selector := range []string{
		"status.phase=Running",
		"metadata.uid=abc123",
		"metadata.name",
	} {
		t.Run(selector, func(t *testing.T) {
			_, err := parseFieldSelector(selector)
			if err == nil {
				t.Fatal("expected error, got nil")
			}
			if !errors.Is(err, storage.ErrInvalidRequest) {
				t.Errorf("expected ErrInvalidRequest, got %v", err)
			}
		})
	}
}

func TestParseLabelSelector_AcceptsSetBased(t *testing.T) {
	t.Parallel()
	// These selectors were rejected by the old equality-only parser. Confirm
	// each parses cleanly now, exposing the shape client-go and kubectl use.
	inputs := []string{
		"app=web",
		"app==web",
		"app!=web",
		"tier in (frontend, backend)",
		"tier notin (frontend, backend)",
		"tier",
		"!tier",
		"app=web,tier in (frontend, backend),!temporary",
	}
	for _, in := range inputs {
		t.Run(in, func(t *testing.T) {
			sel, err := parseLabelSelector(in)
			if err != nil {
				t.Fatalf("parseLabelSelector(%q) error = %v", in, err)
			}
			if sel == nil {
				t.Fatalf("parseLabelSelector(%q) returned nil", in)
			}
		})
	}
}

func TestParseLabelSelector_InvalidReturnsInvalidRequest(t *testing.T) {
	t.Parallel()
	_, err := parseLabelSelector("this is not a selector")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !errors.Is(err, storage.ErrInvalidRequest) {
		t.Errorf("expected ErrInvalidRequest, got %v", err)
	}
}

// normalizedArg collapses pq.Array (which wraps a slice into a driver.Valuer)
// into the equivalent []string, so tests can compare arg slices directly.
func normalizedArg(a interface{}) interface{} {
	if v, ok := a.(driver.Valuer); ok {
		// pq.Array over []string is comparable by falling back to the underlying
		// value; use reflection to unwrap without invoking Value() (which
		// produces a Postgres array literal string, not the input slice).
		rv := reflect.ValueOf(v)
		if rv.Kind() == reflect.Ptr {
			rv = rv.Elem()
		}
		if rv.Kind() == reflect.Struct && rv.NumField() > 0 {
			inner := rv.Field(0)
			if inner.CanInterface() {
				return inner.Interface()
			}
		}
	}
	return a
}

func TestLabelSelectorSQL(t *testing.T) {
	t.Parallel()

	// Pre-seed args with 4 pads so the first emitted placeholder is $5.
	const preExistingArgs = 4

	tests := []struct {
		name       string
		selector   string
		wantClause string
		wantArgs   []interface{}
	}{
		{
			name:       "equals",
			selector:   "app=web",
			wantClause: " AND labels->>$5 = $6",
			wantArgs:   []interface{}{"app", "web"},
		},
		{
			name:       "double equals",
			selector:   "app==web",
			wantClause: " AND labels->>$5 = $6",
			wantArgs:   []interface{}{"app", "web"},
		},
		{
			name:       "not equals — must match when label absent",
			selector:   "app!=web",
			wantClause: " AND (labels->>$5 IS NULL OR labels->>$5 <> $6)",
			wantArgs:   []interface{}{"app", "web"},
		},
		{
			name:       "in",
			selector:   "tier in (frontend, backend)",
			wantClause: " AND labels->>$5 = ANY($6::text[])",
			wantArgs:   []interface{}{"tier", pq.Array([]string{"backend", "frontend"})},
		},
		{
			name:       "notin — must match when label absent",
			selector:   "tier notin (frontend, backend)",
			wantClause: " AND (labels->>$5 IS NULL OR labels->>$5 <> ALL($6::text[]))",
			wantArgs:   []interface{}{"tier", pq.Array([]string{"backend", "frontend"})},
		},
		{
			name:       "exists",
			selector:   "app",
			wantClause: " AND labels->>$5 IS NOT NULL",
			wantArgs:   []interface{}{"app"},
		},
		{
			name:       "does not exist",
			selector:   "!temporary",
			wantClause: " AND labels->>$5 IS NULL",
			wantArgs:   []interface{}{"temporary"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sel, err := parseLabelSelector(tt.selector)
			if err != nil {
				t.Fatalf("parseLabelSelector(%q) error = %v", tt.selector, err)
			}
			args := make([]interface{}, preExistingArgs)
			clause := labelSelectorSQL(sel, &args)
			gotArgs := args[preExistingArgs:]

			if clause != tt.wantClause {
				t.Errorf("clause = %q, want %q", clause, tt.wantClause)
			}
			if len(gotArgs) != len(tt.wantArgs) {
				t.Fatalf("got %d args, want %d: %+v", len(gotArgs), len(tt.wantArgs), gotArgs)
			}
			for i := range gotArgs {
				got := normalizedArg(gotArgs[i])
				want := normalizedArg(tt.wantArgs[i])
				if !reflect.DeepEqual(got, want) {
					t.Errorf("arg[%d] = %#v, want %#v", i, got, want)
				}
			}
		})
	}
}

func TestLabelSelectorSQL_NilAndEmpty(t *testing.T) {
	t.Parallel()
	args := make([]interface{}, 0)
	clause := labelSelectorSQL(nil, &args)
	if clause != "" || len(args) != 0 {
		t.Errorf("nil selector: clause=%q args=%v; want empty", clause, args)
	}
}

func TestLabelSelectorSQL_IsDeterministic(t *testing.T) {
	t.Parallel()
	// Equivalent selectors written in a different order (both requirement order
	// and value order within a set) must produce identical SQL and args.
	pairs := []struct {
		a, b string
	}{
		{"app=web,tier=frontend", "tier=frontend,app=web"},
		{"tier in (b, a)", "tier in (a, b)"},
		{"a=1,b in (y, x),!c", "!c,b in (x, y),a=1"},
	}
	for _, p := range pairs {
		a, err := parseLabelSelector(p.a)
		if err != nil {
			t.Fatalf("parse(%q) err=%v", p.a, err)
		}
		b, err := parseLabelSelector(p.b)
		if err != nil {
			t.Fatalf("parse(%q) err=%v", p.b, err)
		}
		argsA := make([]interface{}, 0)
		argsB := make([]interface{}, 0)
		clauseA := labelSelectorSQL(a, &argsA)
		clauseB := labelSelectorSQL(b, &argsB)
		if clauseA != clauseB {
			t.Errorf("%q vs %q: clause differs\n  a=%q\n  b=%q", p.a, p.b, clauseA, clauseB)
		}
		if len(argsA) != len(argsB) {
			t.Fatalf("%q vs %q: arg count differs %d vs %d", p.a, p.b, len(argsA), len(argsB))
		}
		for i := range argsA {
			if !reflect.DeepEqual(normalizedArg(argsA[i]), normalizedArg(argsB[i])) {
				t.Errorf("%q vs %q: arg[%d] differs: %#v vs %#v", p.a, p.b, i, argsA[i], argsB[i])
			}
		}
	}
}
