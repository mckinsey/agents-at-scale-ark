/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"k8s.io/apimachinery/pkg/runtime"
	"mckinsey.com/ark/internal/storage"
)

type stubConverter struct{ encoded string }

func (c stubConverter) NewObject(string) runtime.Object               { return nil }
func (c stubConverter) NewListObject(string) runtime.Object           { return nil }
func (c stubConverter) Encode(runtime.Object) ([]byte, error)         { return []byte(c.encoded), nil }
func (c stubConverter) Decode(string, []byte) (runtime.Object, error) { return nil, nil }
func (c stubConverter) APIVersion(string) string                      { return "" }

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

func TestCreate_EmitsNotifyInWriteStatement(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("INSERT INTO resources.*pg_notify").WithArgs(
		"Agent", "ns", "a1", "u1", "{}", "{}", sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), notifyChannel,
	).WillReturnRows(sqlmock.NewRows([]string{"resource_version", "generation", "created_at", "pg_notify"}).AddRow(int64(1), int64(1), time.Now(), ""))

	p := &PostgreSQLBackend{db: db, converter: stubConverter{encoded: `{"metadata":{"uid":"u1"},"spec":{},"status":{}}`}}
	if err := p.Create(context.Background(), "Agent", "ns", "a1", nil); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestUpdate_EmitsNotifyInWriteStatement(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("UPDATE resources.*pg_notify").WillReturnRows(
		sqlmock.NewRows([]string{"resource_version", "generation", "uid", "created_at", "updated", "pg_notify"}).
			AddRow(int64(2), int64(1), "u1", time.Now(), true, ""))

	p := &PostgreSQLBackend{db: db, converter: stubConverter{encoded: `{"metadata":{"resourceVersion":"1"},"spec":{},"status":{}}`}}
	if err := p.Update(context.Background(), "Agent", "ns", "a1", nil); err != nil {
		t.Fatalf("Update: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestUpdate_ConflictExecutesNoNotify(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("UPDATE resources.*pg_notify").WillReturnRows(
		sqlmock.NewRows([]string{"resource_version", "generation", "uid", "created_at", "updated", "pg_notify"}).
			AddRow(int64(0), int64(0), "", time.Now(), false, nil))
	mock.ExpectQuery("SELECT COUNT").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

	p := &PostgreSQLBackend{db: db, converter: stubConverter{encoded: `{"metadata":{"resourceVersion":"1"},"spec":{},"status":{}}`}}
	if err := p.Update(context.Background(), "Agent", "ns", "a1", nil); err != storage.ErrConflict {
		t.Fatalf("expected ErrConflict, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestUpdateStatus_EmitsNotifyInWriteStatement(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("UPDATE resources.*pg_notify").WillReturnRows(
		sqlmock.NewRows([]string{"resource_version", "updated", "pg_notify"}).AddRow(int64(2), true, ""))

	p := &PostgreSQLBackend{db: db, converter: stubConverter{encoded: `{"metadata":{"resourceVersion":"1"},"status":{}}`}}
	if err := p.UpdateStatus(context.Background(), "Agent", "ns", "a1", nil); err != nil {
		t.Fatalf("UpdateStatus: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestDelete_EmitsNotifyInWriteStatement(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("UPDATE resources.*pg_notify").WithArgs("Agent", "ns", "a1", notifyChannel).
		WillReturnRows(sqlmock.NewRows([]string{"pg_notify"}).AddRow(""))

	p := &PostgreSQLBackend{db: db}
	if err := p.Delete(context.Background(), "Agent", "ns", "a1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestDelete_NotFoundExecutesNoNotify(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("UPDATE resources.*pg_notify").WithArgs("Agent", "ns", "gone", notifyChannel).
		WillReturnRows(sqlmock.NewRows([]string{"pg_notify"}))

	p := &PostgreSQLBackend{db: db}
	if err := p.Delete(context.Background(), "Agent", "ns", "gone"); err != storage.ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}
