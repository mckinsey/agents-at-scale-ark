/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
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

func TestInitSchema_SerializesViaAdvisoryLock(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectBegin()
	mock.ExpectExec("pg_advisory_xact_lock").WithArgs(schemaInitLockKey).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("CREATE TABLE IF NOT EXISTS resources").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	p := &PostgreSQLBackend{db: db}
	if err := p.initSchema(); err != nil {
		t.Fatalf("initSchema: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestInitSchema_Errors(t *testing.T) {
	cases := []struct {
		name   string
		expect func(mock sqlmock.Sqlmock)
	}{
		{
			name: "begin fails",
			expect: func(mock sqlmock.Sqlmock) {
				mock.ExpectBegin().WillReturnError(context.DeadlineExceeded)
			},
		},
		{
			name: "advisory lock fails",
			expect: func(mock sqlmock.Sqlmock) {
				mock.ExpectBegin()
				mock.ExpectExec("pg_advisory_xact_lock").WithArgs(schemaInitLockKey).WillReturnError(context.DeadlineExceeded)
				mock.ExpectRollback()
			},
		},
		{
			name: "schema exec fails",
			expect: func(mock sqlmock.Sqlmock) {
				mock.ExpectBegin()
				mock.ExpectExec("pg_advisory_xact_lock").WithArgs(schemaInitLockKey).WillReturnResult(sqlmock.NewResult(0, 0))
				mock.ExpectExec("CREATE TABLE IF NOT EXISTS resources").WillReturnError(context.DeadlineExceeded)
				mock.ExpectRollback()
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

			p := &PostgreSQLBackend{db: db}
			if err := p.initSchema(); err == nil {
				t.Fatal("expected error")
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Error(err)
			}
		})
	}
}
