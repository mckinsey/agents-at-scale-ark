/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestStartNotifyListener_ConsumesOnce(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	p := &PostgreSQLBackend{ctx: ctx}

	p.StartNotifyListener()
	p.StartNotifyListener()

	ran := false
	p.notifyOnce.Do(func() { ran = true })
	if ran {
		t.Error("StartNotifyListener did not consume notifyOnce")
	}
}

func TestHandleNotification_NudgesOnlyThatKind(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent", "Team")
	defer backend.cancel()

	backend.handleNotification("Agent")

	if !nudged(bcs["Agent"]) {
		t.Error("Agent broadcaster was not nudged")
	}
	if nudged(bcs["Team"]) {
		t.Error("Team broadcaster was nudged for an Agent notification")
	}
}

func TestHandleNotification_EmptyPayloadIgnored(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent")
	defer backend.cancel()

	backend.handleNotification("")

	if nudged(bcs["Agent"]) {
		t.Error("empty payload should not nudge any broadcaster")
	}
}

func TestHandleNotification_UnknownKindIsNoop(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent")
	defer backend.cancel()

	backend.handleNotification("NoSuchKind")

	if nudged(bcs["Agent"]) {
		t.Error("unknown kind should not nudge other broadcasters")
	}
}

func TestRunNotifyListener_BadConnString(t *testing.T) {
	p := &PostgreSQLBackend{ctx: context.Background(), connStr: "=not-a-conn-string"}
	if err := p.runNotifyListener(); err == nil {
		t.Fatal("expected parse error")
	}
}

func TestStartNotifyListener_RetriesThenStopsOnCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	p := &PostgreSQLBackend{
		ctx:     ctx,
		cancel:  cancel,
		connStr: "host=127.0.0.1 port=1 user=x dbname=x sslmode=disable connect_timeout=1",
	}

	done := make(chan struct{})
	go func() {
		p.startNotifyListener()
		close(done)
	}()

	time.Sleep(100 * time.Millisecond)
	cancel()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("startNotifyListener did not stop after context cancel")
	}
}

func TestNotifyResourceChange_Emits(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectExec("SELECT pg_notify").WithArgs(notifyChannel, "Agent").WillReturnResult(sqlmock.NewResult(0, 0))

	p := &PostgreSQLBackend{db: db}
	p.notifyResourceChange(context.Background(), "Agent")

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestNotifyResourceChange_ErrorIsNonFatal(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectExec("SELECT pg_notify").WithArgs(notifyChannel, "Agent").WillReturnError(context.DeadlineExceeded)

	p := &PostgreSQLBackend{db: db}
	p.notifyResourceChange(context.Background(), "Agent")

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestDelete_EmitsNotifyOnSuccess(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectExec("UPDATE resources").WithArgs("Agent", "ns", "a1").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("SELECT pg_notify").WithArgs(notifyChannel, "Agent").WillReturnResult(sqlmock.NewResult(0, 0))

	p := &PostgreSQLBackend{db: db}
	if err := p.Delete(context.Background(), "Agent", "ns", "a1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestDelete_NotFoundSkipsNotify(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectExec("UPDATE resources").WithArgs("Agent", "ns", "gone").WillReturnResult(sqlmock.NewResult(0, 0))

	p := &PostgreSQLBackend{db: db}
	if err := p.Delete(context.Background(), "Agent", "ns", "gone"); err == nil {
		t.Fatal("expected ErrNotFound")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}
