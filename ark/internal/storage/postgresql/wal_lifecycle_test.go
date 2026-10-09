/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/lib/pq"
)

func TestStartWALConsumer_ConsumesOnce(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	p := &PostgreSQLBackend{ctx: ctx}

	p.StartWALConsumer()
	p.StartWALConsumer()

	ran := false
	p.walOnce.Do(func() { ran = true })
	if ran {
		t.Error("StartWALConsumer did not consume walOnce")
	}
}

func TestAssertSchemaCompatible_CompatibleVersion(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("SELECT max\\(version_id\\) FROM goose_db_version").
		WillReturnRows(sqlmock.NewRows([]string{"max"}).AddRow(expectedSchemaVersion))

	if err := assertSchemaCompatible(context.Background(), db); err != nil {
		t.Fatalf("assertSchemaCompatible: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestAssertSchemaCompatible_Errors(t *testing.T) {
	cases := []struct {
		name      string
		expect    func(mock sqlmock.Sqlmock)
		wantUnmig bool
	}{
		{
			name: "missing version table",
			expect: func(mock sqlmock.Sqlmock) {
				mock.ExpectQuery("SELECT max\\(version_id\\) FROM goose_db_version").
					WillReturnError(&pq.Error{Code: undefinedTableCode})
			},
			wantUnmig: true,
		},
		{
			name: "no rows recorded",
			expect: func(mock sqlmock.Sqlmock) {
				mock.ExpectQuery("SELECT max\\(version_id\\) FROM goose_db_version").
					WillReturnRows(sqlmock.NewRows([]string{"max"}).AddRow(nil))
			},
			wantUnmig: true,
		},
		{
			name: "database too old",
			expect: func(mock sqlmock.Sqlmock) {
				mock.ExpectQuery("SELECT max\\(version_id\\) FROM goose_db_version").
					WillReturnRows(sqlmock.NewRows([]string{"max"}).AddRow(minCompatibleSchemaVersion - 1))
			},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = db.Close() }()
			c.expect(mock)

			err = assertSchemaCompatible(context.Background(), db)
			if err == nil {
				t.Fatal("expected error")
			}
			if c.wantUnmig && !errors.Is(err, ErrSchemaUnmigrated) {
				t.Errorf("expected ErrSchemaUnmigrated, got %v", err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Error(err)
			}
		})
	}
}
