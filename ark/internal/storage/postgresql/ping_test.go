/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestPing(t *testing.T) {
	tests := []struct {
		name    string
		pingErr error
	}{
		{"healthy", nil},
		{"unhealthy", errors.New("db down")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
			if err != nil {
				t.Fatalf("sqlmock: %v", err)
			}
			defer func() { _ = db.Close() }()

			exp := mock.ExpectPing()
			if tt.pingErr != nil {
				exp.WillReturnError(tt.pingErr)
			}

			b := &PostgreSQLBackend{db: db}
			if err := b.Ping(context.Background()); !errors.Is(err, tt.pingErr) {
				t.Fatalf("Ping() = %v, want %v", err, tt.pingErr)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Errorf("unmet expectations: %v", err)
			}
		})
	}
}
