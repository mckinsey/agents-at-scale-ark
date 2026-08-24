/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestCheckServerVersion(t *testing.T) {
	tests := []struct {
		name       string
		versionNum int
		version    string
		wantErr    string
	}{
		{"at floor", 150000, "15.0", ""},
		{"above floor", 180001, "18.1", ""},
		{"below floor", 140012, "14.12", "PostgreSQL 14.12 is not supported: the storage backend requires PostgreSQL 15 or newer"},
		{"far below floor", 100023, "10.23", "PostgreSQL 10.23 is not supported: the storage backend requires PostgreSQL 15 or newer"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatalf("sqlmock: %v", err)
			}
			defer func() { _ = db.Close() }()

			mock.ExpectQuery(`server_version_num`).WillReturnRows(
				sqlmock.NewRows([]string{"current_setting", "current_setting"}).
					AddRow(tt.versionNum, tt.version))

			err = checkServerVersion(context.Background(), db)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("checkServerVersion() = %v, want nil", err)
				}
			} else if err == nil || err.Error() != tt.wantErr {
				t.Fatalf("checkServerVersion() = %v, want %q", err, tt.wantErr)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Errorf("unmet expectations: %v", err)
			}
		})
	}
}

func TestCheckServerVersion_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery(`server_version_num`).WillReturnError(errors.New("connection reset"))

	got := checkServerVersion(context.Background(), db)
	if got == nil || !strings.Contains(got.Error(), "failed to read server version") {
		t.Fatalf("checkServerVersion() = %v, want wrapped read error", got)
	}
}
