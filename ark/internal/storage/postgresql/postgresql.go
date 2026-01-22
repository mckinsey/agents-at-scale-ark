/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/lib/pq"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/klog/v2"

	"mckinsey.com/ark/internal/storage"
)

const jsonNull = "null"

type Config struct {
	Host     string
	Port     int
	Database string
	User     string
	Password string
	SSLMode  string
}

type PostgreSQLBackend struct {
	db        *sql.DB
	connStr   string
	converter storage.TypeConverter
	watchers  map[string][]chan watch.Event
	mu        sync.RWMutex
	ctx       context.Context
	cancel    context.CancelFunc
}

func New(cfg Config, converter storage.TypeConverter) (*PostgreSQLBackend, error) {
	if cfg.SSLMode == "" {
		cfg.SSLMode = "disable"
	}
	if cfg.Port == 0 {
		cfg.Port = 5432
	}

	connStr := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.Database, cfg.SSLMode,
	)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	backend := &PostgreSQLBackend{
		db:        db,
		connStr:   connStr,
		converter: converter,
		watchers:  make(map[string][]chan watch.Event),
		ctx:       ctx,
		cancel:    cancel,
	}

	if err := backend.initSchema(); err != nil {
		_ = db.Close()
		cancel()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	go backend.listenForNotifications()

	return backend, nil
}

func (p *PostgreSQLBackend) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS resources (
		id SERIAL PRIMARY KEY,
		kind TEXT NOT NULL,
		namespace TEXT NOT NULL,
		name TEXT NOT NULL,
		resource_version BIGSERIAL,
		generation BIGINT DEFAULT 1,
		uid TEXT NOT NULL,
		spec JSONB NOT NULL DEFAULT '{}',
		status JSONB DEFAULT '{}',
		labels JSONB DEFAULT '{}',
		annotations JSONB DEFAULT '{}',
		created_at TIMESTAMPTZ DEFAULT NOW(),
		updated_at TIMESTAMPTZ DEFAULT NOW(),
		deleted_at TIMESTAMPTZ,
		UNIQUE(kind, namespace, name)
	);

	CREATE INDEX IF NOT EXISTS idx_resources_kind_namespace ON resources(kind, namespace);
	CREATE INDEX IF NOT EXISTS idx_resources_kind_namespace_name ON resources(kind, namespace, name);
	CREATE INDEX IF NOT EXISTS idx_resources_labels ON resources USING GIN(labels);
	CREATE INDEX IF NOT EXISTS idx_resources_deleted ON resources(deleted_at) WHERE deleted_at IS NULL;

	CREATE OR REPLACE FUNCTION notify_resource_change()
	RETURNS TRIGGER AS $$
	BEGIN
		PERFORM pg_notify('ark_resources', json_build_object(
			'operation', TG_OP,
			'kind', COALESCE(NEW.kind, OLD.kind),
			'namespace', COALESCE(NEW.namespace, OLD.namespace),
			'name', COALESCE(NEW.name, OLD.name),
			'resource_version', COALESCE(NEW.resource_version, OLD.resource_version)
		)::text);
		RETURN NEW;
	END;
	$$ LANGUAGE plpgsql;

	DROP TRIGGER IF EXISTS resource_change_trigger ON resources;
	CREATE TRIGGER resource_change_trigger
	AFTER INSERT OR UPDATE OR DELETE ON resources
	FOR EACH ROW EXECUTE FUNCTION notify_resource_change();
	`
	_, err := p.db.Exec(schema)
	return err
}

func (p *PostgreSQLBackend) listenForNotifications() {
	listener := pq.NewListener(p.connStr, 10*time.Second, time.Minute, func(ev pq.ListenerEventType, err error) {
		if err != nil {
			klog.Errorf("PostgreSQL listener error: %v", err)
		}
	})

	if err := listener.Listen("ark_resources"); err != nil {
		klog.Errorf("Failed to listen for notifications: %v", err)
		return
	}

	defer func() { _ = listener.Close() }()

	for {
		select {
		case <-p.ctx.Done():
			return
		case n := <-listener.Notify:
			if n == nil {
				continue
			}
			p.handleNotification(n.Extra)
		case <-time.After(90 * time.Second):
			if err := listener.Ping(); err != nil {
				klog.Warningf("Failed to ping listener: %v", err)
			}
		}
	}
}

func (p *PostgreSQLBackend) handleNotification(payload string) {
	var notification struct {
		Operation       string `json:"operation"`
		Kind            string `json:"kind"`
		Namespace       string `json:"namespace"`
		Name            string `json:"name"`
		ResourceVersion int64  `json:"resource_version"`
	}

	if err := json.Unmarshal([]byte(payload), &notification); err != nil {
		klog.Warningf("Failed to parse notification: %v", err)
		return
	}

	var eventType watch.EventType
	switch notification.Operation {
	case "INSERT":
		eventType = watch.Added
	case "UPDATE":
		eventType = watch.Modified
	case "DELETE":
		eventType = watch.Deleted
	default:
		return
	}

	obj, err := p.Get(context.Background(), notification.Kind, notification.Namespace, notification.Name)
	if err != nil && eventType != watch.Deleted {
		klog.Warningf("Failed to get object for notification: %v", err)
		return
	}

	p.notifyWatchers(notification.Kind, notification.Namespace, eventType, obj, notification.ResourceVersion)
}

func (p *PostgreSQLBackend) Create(ctx context.Context, kind, namespace, name string, obj runtime.Object) error {
	data, err := p.converter.Encode(obj)
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

	specJSON := string(resource.Spec)
	if specJSON == "" || specJSON == jsonNull {
		specJSON = "{}"
	}
	statusJSON := string(resource.Status)
	if statusJSON == "" || statusJSON == jsonNull {
		statusJSON = "{}"
	}

	_, err = p.db.ExecContext(ctx, `
		INSERT INTO resources (kind, namespace, name, uid, spec, status, labels, annotations)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb)
	`, kind, namespace, name, resource.Metadata.UID, specJSON, statusJSON, string(labelsJSON), string(annotationsJSON))
	if err != nil {
		return fmt.Errorf("failed to insert resource: %w", err)
	}

	return nil
}

func (p *PostgreSQLBackend) Get(ctx context.Context, kind, namespace, name string) (runtime.Object, error) {
	row := p.db.QueryRowContext(ctx, `
		SELECT resource_version, generation, uid, spec, status, labels, annotations, created_at, updated_at
		FROM resources
		WHERE kind = $1 AND namespace = $2 AND name = $3 AND deleted_at IS NULL
	`, kind, namespace, name)

	var rv, generation int64
	var uid string
	var spec, status, labels, annotations []byte
	var createdAt, updatedAt time.Time

	if err := row.Scan(&rv, &generation, &uid, &spec, &status, &labels, &annotations, &createdAt, &updatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("not found")
		}
		return nil, fmt.Errorf("failed to scan row: %w", err)
	}

	return p.reconstructObject(kind, namespace, name, rv, generation, uid, string(spec), string(status), string(labels), string(annotations), createdAt)
}

func (p *PostgreSQLBackend) List(ctx context.Context, kind, namespace string, opts storage.ListOptions) ([]runtime.Object, string, error) {
	query := `
		SELECT resource_version, generation, name, uid, spec, status, labels, annotations, created_at
		FROM resources
		WHERE kind = $1 AND deleted_at IS NULL
	`
	args := []interface{}{kind}
	argIndex := 2

	if namespace != "" {
		query += fmt.Sprintf(" AND namespace = $%d", argIndex)
		args = append(args, namespace)
		argIndex++
	}

	query += " ORDER BY resource_version DESC"

	if opts.Limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", argIndex)
		args = append(args, opts.Limit)
	}

	rows, err := p.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", fmt.Errorf("failed to query resources: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var objects []runtime.Object
	var lastRV int64

	for rows.Next() {
		var rv, generation int64
		var name, uid string
		var spec, status, labels, annotations []byte
		var createdAt time.Time

		if err := rows.Scan(&rv, &generation, &name, &uid, &spec, &status, &labels, &annotations, &createdAt); err != nil {
			return nil, "", fmt.Errorf("failed to scan row: %w", err)
		}

		obj, err := p.reconstructObject(kind, namespace, name, rv, generation, uid, string(spec), string(status), string(labels), string(annotations), createdAt)
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

func (p *PostgreSQLBackend) Update(ctx context.Context, kind, namespace, name string, obj runtime.Object) error {
	data, err := p.converter.Encode(obj)
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

	specJSON := string(resource.Spec)
	if specJSON == "" || specJSON == jsonNull {
		specJSON = "{}"
	}
	statusJSON := string(resource.Status)
	if statusJSON == "" || statusJSON == jsonNull {
		statusJSON = "{}"
	}

	result, err := p.db.ExecContext(ctx, `
		UPDATE resources
		SET spec = $1::jsonb, status = $2::jsonb, labels = $3::jsonb, annotations = $4::jsonb,
		    generation = generation + 1, updated_at = NOW()
		WHERE kind = $5 AND namespace = $6 AND name = $7 AND deleted_at IS NULL
	`, specJSON, statusJSON, string(labelsJSON), string(annotationsJSON), kind, namespace, name)
	if err != nil {
		return fmt.Errorf("failed to update resource: %w", err)
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fmt.Errorf("not found")
	}

	return nil
}

func (p *PostgreSQLBackend) Delete(ctx context.Context, kind, namespace, name string) error {
	result, err := p.db.ExecContext(ctx, `
		UPDATE resources SET deleted_at = NOW()
		WHERE kind = $1 AND namespace = $2 AND name = $3 AND deleted_at IS NULL
	`, kind, namespace, name)
	if err != nil {
		return fmt.Errorf("failed to delete resource: %w", err)
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		return fmt.Errorf("not found")
	}

	return nil
}

func (p *PostgreSQLBackend) Watch(ctx context.Context, kind, namespace string, opts storage.WatchOptions) (watch.Interface, error) {
	ch := make(chan watch.Event, 100)
	key := fmt.Sprintf("%s/%s", kind, namespace)

	p.mu.Lock()
	p.watchers[key] = append(p.watchers[key], ch)
	p.mu.Unlock()

	return &postgresWatcher{
		ch:      ch,
		backend: p,
		key:     key,
		ctx:     ctx,
	}, nil
}

func (p *PostgreSQLBackend) GetResourceVersion(ctx context.Context, kind, namespace, name string) (int64, error) {
	var rv int64
	err := p.db.QueryRowContext(ctx, `
		SELECT resource_version FROM resources
		WHERE kind = $1 AND namespace = $2 AND name = $3 AND deleted_at IS NULL
	`, kind, namespace, name).Scan(&rv)
	return rv, err
}

func (p *PostgreSQLBackend) Close() error {
	p.cancel()
	return p.db.Close()
}

func (p *PostgreSQLBackend) Cleanup(ctx context.Context, retention time.Duration) (int64, error) {
	cutoff := time.Now().Add(-retention)
	result, err := p.db.ExecContext(ctx, `
		DELETE FROM resources WHERE deleted_at IS NOT NULL AND deleted_at < $1
	`, cutoff)
	if err != nil {
		return 0, fmt.Errorf("failed to cleanup deleted resources: %w", err)
	}
	return result.RowsAffected()
}

func (p *PostgreSQLBackend) reconstructObject(kind, namespace, name string, rv, generation int64, uid, spec, status, labels, annotations string, createdAt time.Time) (runtime.Object, error) {
	var labelsMap map[string]string
	var annotationsMap map[string]string
	_ = json.Unmarshal([]byte(labels), &labelsMap)
	_ = json.Unmarshal([]byte(annotations), &annotationsMap)

	obj := map[string]interface{}{
		"apiVersion": p.converter.APIVersion(kind),
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

	if spec != "" && spec != "{}" {
		var specData interface{}
		_ = json.Unmarshal([]byte(spec), &specData)
		obj["spec"] = specData
	}
	if status != "" && status != "{}" {
		var statusData interface{}
		_ = json.Unmarshal([]byte(status), &statusData)
		obj["status"] = statusData
	}

	data, _ := json.Marshal(obj)
	return p.converter.Decode(kind, data)
}

func (p *PostgreSQLBackend) notifyWatchers(kind, namespace string, eventType watch.EventType, obj runtime.Object, _ int64) {
	key := fmt.Sprintf("%s/%s", kind, namespace)
	allKey := fmt.Sprintf("%s/", kind)

	p.mu.RLock()
	defer p.mu.RUnlock()

	event := watch.Event{Type: eventType, Object: obj}

	for _, ch := range p.watchers[key] {
		select {
		case ch <- event:
		default:
			klog.Warning("Watcher channel full, dropping event")
		}
	}

	if namespace != "" {
		for _, ch := range p.watchers[allKey] {
			select {
			case ch <- event:
			default:
				klog.Warning("Watcher channel full, dropping event")
			}
		}
	}
}

func (p *PostgreSQLBackend) removeWatcher(key string, ch chan watch.Event) {
	p.mu.Lock()
	defer p.mu.Unlock()

	watchers := p.watchers[key]
	for i, w := range watchers {
		if w == ch {
			p.watchers[key] = append(watchers[:i], watchers[i+1:]...)
			break
		}
	}
}

type postgresWatcher struct {
	ch      chan watch.Event
	backend *PostgreSQLBackend
	key     string
	ctx     context.Context
}

func (w *postgresWatcher) Stop() {
	w.backend.removeWatcher(w.key, w.ch)
	close(w.ch)
}

func (w *postgresWatcher) ResultChan() <-chan watch.Event {
	return w.ch
}
