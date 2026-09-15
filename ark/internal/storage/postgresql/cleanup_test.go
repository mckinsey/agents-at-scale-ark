/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"errors"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestCleanupConnString(t *testing.T) {
	got := cleanupConnString(Config{Host: "h", User: "u", Password: "p", Database: "d"})
	for _, want := range []string{"host='h'", "user='u'", "dbname='d'", "port=5432", "sslmode='require'", "connect_timeout=10"} {
		if !strings.Contains(got, want) {
			t.Errorf("conn string %q missing %q", got, want)
		}
	}

	got = cleanupConnString(Config{Host: "h", Port: 6000, SSLMode: "disable"})
	if !strings.Contains(got, "port=6000") || !strings.Contains(got, "sslmode='disable'") {
		t.Errorf("explicit port/sslmode not honored: %q", got)
	}

	got = cleanupConnString(Config{Host: "h", SSLMode: "verify-full", SSLRootCert: "/c/ca.crt", SSLCert: "/c/tls.crt", SSLKey: "/c/tls.key"})
	for _, want := range []string{"sslrootcert='/c/ca.crt'", "sslcert='/c/tls.crt'", "sslkey='/c/tls.key'"} {
		if !strings.Contains(got, want) {
			t.Errorf("conn string %q missing %q", got, want)
		}
	}

	got = cleanupConnString(Config{Host: "h", Password: `p' \x`})
	if !strings.Contains(got, `password='p\' \\x'`) {
		t.Errorf("password not escaped: %q", got)
	}
}

func withFastRetry(t *testing.T) {
	t.Helper()
	old := cleanupRetryInterval
	cleanupRetryInterval = time.Millisecond
	t.Cleanup(func() { cleanupRetryInterval = old })
}

func TestDropReplicationArtifacts_Success(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectExec("pg_terminate_backend").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("pg_drop_replication_slot").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("count").WithArgs(walSlotName).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectExec("DROP PUBLICATION").WillReturnResult(sqlmock.NewResult(0, 0))

	if err := dropReplicationArtifacts(context.Background(), db); err != nil {
		t.Fatalf("expected success, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestDropReplicationArtifacts_RetriesWhenRecreated(t *testing.T) {
	withFastRetry(t)
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	// First pass: slot still present after drop (recreated by a live consumer).
	mock.ExpectExec("pg_terminate_backend").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("pg_drop_replication_slot").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("count").WithArgs(walSlotName).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	// Second pass: gone.
	mock.ExpectExec("pg_terminate_backend").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("pg_drop_replication_slot").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("count").WithArgs(walSlotName).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectExec("DROP PUBLICATION").WillReturnResult(sqlmock.NewResult(0, 0))

	if err := dropReplicationArtifacts(context.Background(), db); err != nil {
		t.Fatalf("expected success after retry, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestDropReplicationArtifacts_TerminateError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectExec("pg_terminate_backend").WithArgs(walSlotName).WillReturnError(errors.New("boom"))

	err = dropReplicationArtifacts(context.Background(), db)
	if err == nil || !strings.Contains(err.Error(), "terminate slot consumer") {
		t.Fatalf("expected terminate error, got %v", err)
	}
}

func TestDropReplicationArtifacts_PublicationError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectExec("pg_terminate_backend").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("pg_drop_replication_slot").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("count").WithArgs(walSlotName).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectExec("DROP PUBLICATION").WillReturnError(errors.New("nope"))

	err = dropReplicationArtifacts(context.Background(), db)
	if err == nil || !strings.Contains(err.Error(), "drop publication") {
		t.Fatalf("expected publication error, got %v", err)
	}
}

func TestDropReplicationArtifacts_VerifyError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectExec("pg_terminate_backend").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("pg_drop_replication_slot").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("count").WithArgs(walSlotName).WillReturnError(errors.New("boom"))

	err = dropReplicationArtifacts(context.Background(), db)
	if err == nil || !strings.Contains(err.Error(), "verify slot dropped") {
		t.Fatalf("expected verify error, got %v", err)
	}
}

func TestDropReplicationArtifacts_RetriesOnDropError(t *testing.T) {
	withFastRetry(t)
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	// First pass: drop fails while a consumer still holds the slot.
	mock.ExpectExec("pg_terminate_backend").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("pg_drop_replication_slot").WithArgs(walSlotName).WillReturnError(errors.New("slot is active"))
	// Second pass: gone.
	mock.ExpectExec("pg_terminate_backend").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("pg_drop_replication_slot").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("count").WithArgs(walSlotName).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectExec("DROP PUBLICATION").WillReturnResult(sqlmock.NewResult(0, 0))

	if err := dropReplicationArtifacts(context.Background(), db); err != nil {
		t.Fatalf("expected success after retry, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

func TestDropReplicationArtifacts_UnreachableDatabase(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()

	err = DropReplicationArtifacts(context.Background(), Config{Host: "127.0.0.1", Port: port, Database: "ark", User: "ark", Password: "pw", SSLMode: "disable"})
	if err == nil || !strings.Contains(err.Error(), "terminate slot consumer") {
		t.Fatalf("expected connection failure from terminate step, got %v", err)
	}
}

func TestDropReplicationArtifacts_DeadlineExceeded(t *testing.T) {
	withFastRetry(t)
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	// Slot keeps coming back; the caller's context deadline must end the loop.
	for i := 0; i < 200; i++ {
		mock.ExpectExec("pg_terminate_backend").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectExec("pg_drop_replication_slot").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectQuery("count").WithArgs(walSlotName).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	}

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	err = dropReplicationArtifacts(ctx, db)
	if err == nil {
		t.Fatal("expected error after deadline, got nil")
	}
	if !errors.Is(ctx.Err(), context.DeadlineExceeded) {
		t.Fatalf("loop ended before deadline: %v", err)
	}
}

func TestDropReplicationArtifacts_ContextCanceled(t *testing.T) {
	withFastRetry(t)
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()

	ctx, cancel := context.WithCancel(context.Background())
	mock.ExpectExec("pg_terminate_backend").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("pg_drop_replication_slot").WithArgs(walSlotName).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery("count").WithArgs(walSlotName).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	cancel()

	if err := dropReplicationArtifacts(ctx, db); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
}
