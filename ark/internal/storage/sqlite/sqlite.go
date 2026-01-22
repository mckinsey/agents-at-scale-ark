/* Copyright 2025. McKinsey & Company */

package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/klog/v2"

	"mckinsey.com/ark/internal/storage"
)

type SQLiteBackend struct {
	db        *sql.DB
	converter storage.TypeConverter
	watchers  map[string][]chan watch.Event
	mu        sync.RWMutex
	sem       chan struct{}
}

func New(path string, converter storage.TypeConverter) (*SQLiteBackend, error) {
	db, err := sql.Open("sqlite3", path+"?_journal_mode=WAL&_synchronous=NORMAL&_busy_timeout=10000&_txlock=immediate&cache=shared")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(time.Hour)

	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	backend := &SQLiteBackend{
		db:        db,
		converter: converter,
		watchers:  make(map[string][]chan watch.Event),
		sem:       make(chan struct{}, 3),
	}

	if err := backend.initSchema(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return backend, nil
}

func (s *SQLiteBackend) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS resources (
		kind TEXT NOT NULL,
		namespace TEXT NOT NULL,
		name TEXT NOT NULL,
		resource_version INTEGER PRIMARY KEY AUTOINCREMENT,
		generation INTEGER DEFAULT 1,
		uid TEXT NOT NULL,
		spec TEXT NOT NULL,
		status TEXT,
		labels TEXT,
		annotations TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		deleted_at TIMESTAMP,
		UNIQUE(kind, namespace, name)
	);

	CREATE INDEX IF NOT EXISTS idx_resources_kind_namespace ON resources(kind, namespace);
	CREATE INDEX IF NOT EXISTS idx_resources_kind_namespace_name ON resources(kind, namespace, name);
	`
	_, err := s.db.Exec(schema)
	return err
}

func (s *SQLiteBackend) Create(ctx context.Context, kind, namespace, name string, obj runtime.Object) error {
	data, err := s.converter.Encode(obj)
	if err != nil {
		return fmt.Errorf("failed to encode object: %w", err)
	}

	var resource struct {
		Metadata struct {
			UID         string            `json:"uid"`
			Labels      map[string]string `json:"labels"`
			Annotations map[string]string `json:"annotations"`
		} `json:"metadata"`
		Spec   json.RawMessage `json:"spec"`
		Status json.RawMessage `json:"status"`
	}

	if err := json.Unmarshal(data, &resource); err != nil {
		return fmt.Errorf("failed to parse object: %w", err)
	}

	labelsJSON, _ := json.Marshal(resource.Metadata.Labels)
	annotationsJSON, _ := json.Marshal(resource.Metadata.Annotations)

	result, err := s.db.ExecContext(ctx, `
		INSERT INTO resources (kind, namespace, name, uid, spec, status, labels, annotations)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, kind, namespace, name, resource.Metadata.UID, string(resource.Spec), string(resource.Status), string(labelsJSON), string(annotationsJSON))
	if err != nil {
		return fmt.Errorf("failed to insert resource: %w", err)
	}

	rv, _ := result.LastInsertId()
	s.notifyWatchers(kind, namespace, watch.Added, obj, rv)
	return nil
}

func (s *SQLiteBackend) Get(ctx context.Context, kind, namespace, name string) (runtime.Object, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT resource_version, generation, uid, spec, status, labels, annotations, created_at, updated_at
		FROM resources
		WHERE kind = ? AND namespace = ? AND name = ? AND deleted_at IS NULL
	`, kind, namespace, name)

	var rv, generation int64
	var uid, spec, status, labels, annotations string
	var createdAt, updatedAt time.Time

	if err := row.Scan(&rv, &generation, &uid, &spec, &status, &labels, &annotations, &createdAt, &updatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("not found")
		}
		return nil, fmt.Errorf("failed to scan row: %w", err)
	}

	return s.reconstructObject(kind, namespace, name, rv, generation, uid, spec, status, labels, annotations, createdAt)
}

func (s *SQLiteBackend) List(ctx context.Context, kind, namespace string, opts storage.ListOptions) ([]runtime.Object, string, error) {
	select {
	case s.sem <- struct{}{}:
		defer func() { <-s.sem }()
	case <-ctx.Done():
		return nil, "", ctx.Err()
	}

	query := `
		SELECT resource_version, generation, name, uid, spec, status, labels, annotations, created_at
		FROM resources
		WHERE kind = ? AND deleted_at IS NULL
	`
	args := []interface{}{kind}

	if namespace != "" {
		query += " AND namespace = ?"
		args = append(args, namespace)
	}

	if opts.Limit > 0 {
		query += " ORDER BY resource_version DESC LIMIT ?"
		args = append(args, opts.Limit)
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", fmt.Errorf("failed to query resources: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var objects []runtime.Object
	var lastRV int64

	for rows.Next() {
		var rv, generation int64
		var name, uid, spec, status, labels, annotations string
		var createdAt time.Time

		if err := rows.Scan(&rv, &generation, &name, &uid, &spec, &status, &labels, &annotations, &createdAt); err != nil {
			return nil, "", fmt.Errorf("failed to scan row: %w", err)
		}

		obj, err := s.reconstructObject(kind, namespace, name, rv, generation, uid, spec, status, labels, annotations, createdAt)
		if err != nil {
			klog.Warningf("Failed to reconstruct object %s/%s: %v", namespace, name, err)
			continue
		}

		objects = append(objects, obj)
		if rv > lastRV {
			lastRV = rv
		}
	}

	return objects, fmt.Sprintf("%d", lastRV), nil
}

func (s *SQLiteBackend) Update(ctx context.Context, kind, namespace, name string, obj runtime.Object) error {
	data, err := s.converter.Encode(obj)
	if err != nil {
		return fmt.Errorf("failed to encode object: %w", err)
	}

	var resource struct {
		Metadata struct {
			Labels      map[string]string `json:"labels"`
			Annotations map[string]string `json:"annotations"`
		} `json:"metadata"`
		Spec   json.RawMessage `json:"spec"`
		Status json.RawMessage `json:"status"`
	}

	if err := json.Unmarshal(data, &resource); err != nil {
		return fmt.Errorf("failed to parse object: %w", err)
	}

	labelsJSON, _ := json.Marshal(resource.Metadata.Labels)
	annotationsJSON, _ := json.Marshal(resource.Metadata.Annotations)

	result, err := s.db.ExecContext(ctx, `
		UPDATE resources
		SET spec = ?, status = ?, labels = ?, annotations = ?,
		    generation = generation + 1, updated_at = CURRENT_TIMESTAMP
		WHERE kind = ? AND namespace = ? AND name = ? AND deleted_at IS NULL
	`, string(resource.Spec), string(resource.Status), string(labelsJSON), string(annotationsJSON), kind, namespace, name)
	if err != nil {
		return fmt.Errorf("failed to update resource: %w", err)
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fmt.Errorf("not found")
	}

	rv, _ := s.GetResourceVersion(ctx, kind, namespace, name)
	s.notifyWatchers(kind, namespace, watch.Modified, obj, rv)
	return nil
}

func (s *SQLiteBackend) Delete(ctx context.Context, kind, namespace, name string) error {
	obj, err := s.Get(ctx, kind, namespace, name)
	if err != nil {
		return err
	}

	result, err := s.db.ExecContext(ctx, `
		UPDATE resources SET deleted_at = CURRENT_TIMESTAMP
		WHERE kind = ? AND namespace = ? AND name = ? AND deleted_at IS NULL
	`, kind, namespace, name)
	if err != nil {
		return fmt.Errorf("failed to delete resource: %w", err)
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fmt.Errorf("not found")
	}

	s.notifyWatchers(kind, namespace, watch.Deleted, obj, 0)
	return nil
}

func (s *SQLiteBackend) Watch(ctx context.Context, kind, namespace string, opts storage.WatchOptions) (watch.Interface, error) {
	klog.V(2).Infof("Watch starting for %s/%s", kind, namespace)
	ch := make(chan watch.Event, 100)
	key := fmt.Sprintf("%s/%s", kind, namespace)

	s.mu.Lock()
	s.watchers[key] = append(s.watchers[key], ch)
	s.mu.Unlock()

	watcher := &sqliteWatcher{
		ch:      ch,
		backend: s,
		key:     key,
		ctx:     ctx,
	}

	immediateBookmark := s.converter.NewObject(kind)
	select {
	case ch <- watch.Event{Type: watch.Bookmark, Object: immediateBookmark}:
	default:
		klog.Warningf("Could not send immediate bookmark for %s/%s", kind, namespace)
	}

	go func() {
		objects, _, err := s.List(ctx, kind, namespace, storage.ListOptions{})
		if err != nil {
			klog.Errorf("Failed to list objects for watch: %v", err)
			return
		}

		for _, obj := range objects {
			select {
			case ch <- watch.Event{Type: watch.Added, Object: obj}:
			case <-ctx.Done():
				return
			}
		}

		bookmarkObj := s.converter.NewObject(kind)
		select {
		case ch <- watch.Event{Type: watch.Bookmark, Object: bookmarkObj}:
		case <-ctx.Done():
			return
		}
		klog.V(2).Infof("Watch for %s/%s initialized with %d objects", kind, namespace, len(objects))

		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				bookmarkObj := s.converter.NewObject(kind)
				select {
				case ch <- watch.Event{Type: watch.Bookmark, Object: bookmarkObj}:
				default:
				}
			}
		}
	}()

	return watcher, nil
}

func (s *SQLiteBackend) GetResourceVersion(ctx context.Context, kind, namespace, name string) (int64, error) {
	var rv int64
	err := s.db.QueryRowContext(ctx, `
		SELECT resource_version FROM resources
		WHERE kind = ? AND namespace = ? AND name = ? AND deleted_at IS NULL
	`, kind, namespace, name).Scan(&rv)
	return rv, err
}

func (s *SQLiteBackend) Close() error {
	return s.db.Close()
}

func (s *SQLiteBackend) Cleanup(ctx context.Context, retention time.Duration) (int64, error) {
	cutoff := time.Now().Add(-retention)
	result, err := s.db.ExecContext(ctx, `
		DELETE FROM resources WHERE deleted_at IS NOT NULL AND deleted_at < ?
	`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("failed to cleanup deleted resources: %w", err)
	}
	return result.RowsAffected()
}

func (s *SQLiteBackend) reconstructObject(kind, namespace, name string, rv, generation int64, uid, spec, status, labels, annotations string, createdAt time.Time) (runtime.Object, error) {
	var labelsMap map[string]string
	var annotationsMap map[string]string
	_ = json.Unmarshal([]byte(labels), &labelsMap)
	_ = json.Unmarshal([]byte(annotations), &annotationsMap)

	obj := map[string]interface{}{
		"apiVersion": s.converter.APIVersion(kind),
		"kind":       kind,
		"metadata": map[string]interface{}{
			"name":              name,
			"namespace":         namespace,
			"uid":               uid,
			"resourceVersion":   fmt.Sprintf("%d", rv),
			"generation":        generation,
			"creationTimestamp": createdAt.Format(time.RFC3339),
			"labels":            labelsMap,
			"annotations":       annotationsMap,
		},
	}

	if spec != "" {
		var specData interface{}
		_ = json.Unmarshal([]byte(spec), &specData)
		obj["spec"] = specData
	}
	if status != "" {
		var statusData interface{}
		_ = json.Unmarshal([]byte(status), &statusData)
		obj["status"] = statusData
	}

	data, _ := json.Marshal(obj)
	return s.converter.Decode(kind, data)
}

func (s *SQLiteBackend) notifyWatchers(kind, namespace string, eventType watch.EventType, obj runtime.Object, _ int64) {
	key := fmt.Sprintf("%s/%s", kind, namespace)
	allKey := fmt.Sprintf("%s/", kind)

	s.mu.RLock()
	defer s.mu.RUnlock()

	event := watch.Event{Type: eventType, Object: obj}

	for _, ch := range s.watchers[key] {
		select {
		case ch <- event:
		default:
			klog.Warning("Watcher channel full, dropping event")
		}
	}

	if namespace != "" {
		for _, ch := range s.watchers[allKey] {
			select {
			case ch <- event:
			default:
				klog.Warning("Watcher channel full, dropping event")
			}
		}
	}
}

func (s *SQLiteBackend) removeWatcher(key string, ch chan watch.Event) {
	s.mu.Lock()
	defer s.mu.Unlock()

	watchers := s.watchers[key]
	for i, w := range watchers {
		if w == ch {
			s.watchers[key] = append(watchers[:i], watchers[i+1:]...)
			break
		}
	}
}

type sqliteWatcher struct {
	ch      chan watch.Event
	backend *SQLiteBackend
	key     string
	ctx     context.Context
}

func (w *sqliteWatcher) Stop() {
	w.backend.removeWatcher(w.key, w.ch)
	close(w.ch)
}

func (w *sqliteWatcher) ResultChan() <-chan watch.Event {
	return w.ch
}
