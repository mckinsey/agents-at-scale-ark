/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"errors"
	"testing"

	"mckinsey.com/ark/internal/storage"
)

func TestParseFieldSelector(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		selector    string
		wantPreds   []fieldPredicate
		wantErr     bool
		wantInvalid bool
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
		{
			name:        "unsupported field",
			selector:    "status.phase=Running",
			wantErr:     true,
			wantInvalid: true,
		},
		{
			name:        "unsupported field metadata.uid",
			selector:    "metadata.uid=abc123",
			wantErr:     true,
			wantInvalid: true,
		},
		{
			name:        "malformed selector",
			selector:    "metadata.name",
			wantErr:     true,
			wantInvalid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			preds, err := parseFieldSelector(tt.selector)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil (preds=%v)", preds)
				}
				if tt.wantInvalid && !errors.Is(err, storage.ErrInvalidRequest) {
					t.Errorf("expected ErrInvalidRequest, got %v", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(preds) != len(tt.wantPreds) {
				t.Fatalf("got %d predicates, want %d: %+v", len(preds), len(tt.wantPreds), preds)
			}
			for i, p := range preds {
				if p != tt.wantPreds[i] {
					t.Errorf("predicate[%d] = %+v, want %+v", i, p, tt.wantPreds[i])
				}
			}
		})
	}
}
