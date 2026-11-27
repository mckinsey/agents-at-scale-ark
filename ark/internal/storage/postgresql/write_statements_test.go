/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"strings"
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

var noNotifyMatcher = sqlmock.QueryMatcherFunc(func(expectedSQL, actualSQL string) error {
	if strings.Contains(actualSQL, "pg_notify") {
		return fmt.Errorf("write statement must not call pg_notify: %s", actualSQL)
	}
	if !regexp.MustCompile(expectedSQL).MatchString(actualSQL) {
		return fmt.Errorf("statement %q does not match %q", actualSQL, expectedSQL)
	}
	return nil
})

func newNoNotifyDB(t *testing.T) (*sql.DB, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(noNotifyMatcher))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, mock
}

func TestCreate_DoesNotNotify(t *testing.T) {
	db, mock := newNoNotifyDB(t)
	mock.ExpectQuery("(?s)INSERT INTO resources").WithArgs(
		"Agent", "ns", "a1", "u1", "{}", "{}", sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
	).WillReturnRows(sqlmock.NewRows([]string{"resource_version", "generation", "created_at"}).AddRow(int64(1), int64(1), time.Now()))

	p := &PostgreSQLBackend{db: db, converter: stubConverter{encoded: `{"metadata":{"uid":"u1"},"spec":{},"status":{}}`}}
	if err := p.Create(context.Background(), "Agent", "ns", "a1", nil); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestUpdate_DoesNotNotify(t *testing.T) {
	db, mock := newNoNotifyDB(t)
	mock.ExpectQuery("(?s)UPDATE resources").WillReturnRows(
		sqlmock.NewRows([]string{"resource_version", "generation", "uid", "created_at"}).
			AddRow(int64(2), int64(1), "u1", time.Now()))

	p := &PostgreSQLBackend{db: db, converter: stubConverter{encoded: `{"metadata":{"resourceVersion":"1"},"spec":{},"status":{}}`}}
	if err := p.Update(context.Background(), "Agent", "ns", "a1", nil); err != nil {
		t.Fatalf("Update: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestUpdate_ConflictWhenNoRowMatches(t *testing.T) {
	db, mock := newNoNotifyDB(t)
	mock.ExpectQuery("(?s)UPDATE resources").WillReturnRows(
		sqlmock.NewRows([]string{"resource_version", "generation", "uid", "created_at"}))
	mock.ExpectQuery("SELECT COUNT").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))

	p := &PostgreSQLBackend{db: db, converter: stubConverter{encoded: `{"metadata":{"resourceVersion":"1"},"spec":{},"status":{}}`}}
	if err := p.Update(context.Background(), "Agent", "ns", "a1", nil); err != storage.ErrConflict {
		t.Fatalf("expected ErrConflict, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestUpdateStatus_DoesNotNotify(t *testing.T) {
	db, mock := newNoNotifyDB(t)
	mock.ExpectQuery("(?s)UPDATE resources").WillReturnRows(
		sqlmock.NewRows([]string{"resource_version"}).AddRow(int64(2)))

	p := &PostgreSQLBackend{db: db, converter: stubConverter{encoded: `{"metadata":{"resourceVersion":"1"},"status":{}}`}}
	if err := p.UpdateStatus(context.Background(), "Agent", "ns", "a1", nil); err != nil {
		t.Fatalf("UpdateStatus: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestUpdateStatus_NotFoundWhenNoRowMatches(t *testing.T) {
	db, mock := newNoNotifyDB(t)
	mock.ExpectQuery("(?s)UPDATE resources").WillReturnRows(sqlmock.NewRows([]string{"resource_version"}))
	mock.ExpectQuery("SELECT COUNT").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))

	p := &PostgreSQLBackend{db: db, converter: stubConverter{encoded: `{"metadata":{"resourceVersion":"1"},"status":{}}`}}
	if err := p.UpdateStatus(context.Background(), "Agent", "ns", "a1", nil); err != storage.ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestDelete_DoesNotNotify(t *testing.T) {
	db, mock := newNoNotifyDB(t)
	mock.ExpectQuery("(?s)UPDATE resources").WithArgs("Agent", "ns", "a1").
		WillReturnRows(sqlmock.NewRows([]string{"resource_version"}).AddRow(int64(3)))

	p := &PostgreSQLBackend{db: db}
	if err := p.Delete(context.Background(), "Agent", "ns", "a1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}

func TestDelete_NotFoundWhenNoRowMatches(t *testing.T) {
	db, mock := newNoNotifyDB(t)
	mock.ExpectQuery("(?s)UPDATE resources").WithArgs("Agent", "ns", "gone").
		WillReturnRows(sqlmock.NewRows([]string{"resource_version"}))

	p := &PostgreSQLBackend{db: db}
	if err := p.Delete(context.Background(), "Agent", "ns", "gone"); err != storage.ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Error(err)
	}
}
