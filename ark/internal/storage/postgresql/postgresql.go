/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"sync"
	"time"

	"github.com/lib/pq"
	"k8s.io/apimachinery/pkg/api/meta"
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

	db.SetMaxOpenConns(50)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(30 * time.Minute)
	db.SetConnMaxIdleTime(5 * time.Minute)

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
		finalizers JSONB DEFAULT '[]',
		created_at TIMESTAMPTZ DEFAULT NOW(),
		updated_at TIMESTAMPTZ DEFAULT NOW(),
		deleted_at TIMESTAMPTZ,
		UNIQUE(kind, namespace, name)
	);
	ALTER TABLE resources ADD COLUMN IF NOT EXISTS finalizers JSONB DEFAULT '[]';

	CREATE INDEX IF NOT EXISTS idx_resources_kind_namespace ON resources(kind, namespace);
	CREATE INDEX IF NOT EXISTS idx_resources_kind_namespace_name ON resources(kind, namespace, name);
	CREATE INDEX IF NOT EXISTS idx_resources_labels ON resources USING GIN(labels);
	CREATE INDEX IF NOT EXISTS idx_resources_lookup ON resources(kind, namespace, name, resource_version);

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
	if err != nil {
		obj = p.buildDeletedStub(notification.Kind, notification.Namespace, notification.Name, notification.ResourceVersion)
	}

	if obj == nil {
		klog.Warningf("Object is nil for notification %s %s/%s", notification.Operation, notification.Namespace, notification.Name)
		return
	}

	p.notifyWatchers(notification.Kind, notification.Namespace, eventType, obj, notification.ResourceVersion)
}

func (p *PostgreSQLBackend) buildDeletedStub(kind, namespace, name string, resourceVersion int64) runtime.Object {
	obj := p.converter.NewObject(kind)
	if obj == nil {
		return nil
	}
	if accessor, err := meta.Accessor(obj); err == nil {
		accessor.SetName(name)
		accessor.SetNamespace(namespace)
		accessor.SetResourceVersion(fmt.Sprintf("%d", resourceVersion))
	}
	return obj
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
			Finalizers  []string          `json:"finalizers"`
		} `json:"metadata"`
		Spec   json.RawMessage `json:"spec"`
		Status json.RawMessage `json:"status"`
	}

	if err := json.Unmarshal(data, &resource); err != nil {
		return fmt.Errorf("failed to parse object: %w", err)
	}

	if resource.Metadata.Labels == nil {
		resource.Metadata.Labels = map[string]string{}
	}
	if resource.Metadata.Annotations == nil {
		resource.Metadata.Annotations = map[string]string{}
	}
	if resource.Metadata.Finalizers == nil {
		resource.Metadata.Finalizers = []string{}
	}
	labelsJSON, _ := json.Marshal(resource.Metadata.Labels)
	annotationsJSON, _ := json.Marshal(resource.Metadata.Annotations)
	finalizersJSON, _ := json.Marshal(resource.Metadata.Finalizers)

	specJSON := string(resource.Spec)
	if specJSON == "" || specJSON == jsonNull {
		specJSON = "{}"
	}
	statusJSON := string(resource.Status)
	if statusJSON == "" || statusJSON == jsonNull {
		statusJSON = "{}"
	}

	_, err = p.db.ExecContext(ctx, `
		INSERT INTO resources (kind, namespace, name, uid, spec, status, labels, annotations, finalizers)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb)
	`, kind, namespace, name, resource.Metadata.UID, specJSON, statusJSON, string(labelsJSON), string(annotationsJSON), string(finalizersJSON))
	if err != nil {
		return fmt.Errorf("failed to insert resource: %w", err)
	}

	return nil
}

func (p *PostgreSQLBackend) Get(ctx context.Context, kind, namespace, name string) (runtime.Object, error) {
	row := p.db.QueryRowContext(ctx, `
		SELECT resource_version, generation, uid, spec, status, labels, annotations, finalizers, created_at, updated_at
		FROM resources
		WHERE kind = $1 AND namespace = $2 AND name = $3	`, kind, namespace, name)

	var rv, generation int64
	var uid string
	var spec, status, labels, annotations, finalizers []byte
	var createdAt, updatedAt time.Time

	if err := row.Scan(&rv, &generation, &uid, &spec, &status, &labels, &annotations, &finalizers, &createdAt, &updatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("not found")
		}
		return nil, fmt.Errorf("failed to scan row: %w", err)
	}

	return p.reconstructObject(kind, namespace, name, rv, generation, uid, string(spec), string(status), string(labels), string(annotations), string(finalizers), createdAt)
}

func (p *PostgreSQLBackend) List(ctx context.Context, kind, namespace string, opts storage.ListOptions) ([]runtime.Object, string, error) {
	query := `
		SELECT resource_version, generation, namespace, name, uid, spec, status, labels, annotations, finalizers, created_at
		FROM resources
		WHERE kind = $1	`
	args := []interface{}{kind}
	argIndex := 2

	if namespace != "" {
		query += fmt.Sprintf(" AND namespace = $%d", argIndex)
		args = append(args, namespace)
		argIndex++
	}

	if opts.Continue != "" {
		cursor, err := strconv.ParseInt(opts.Continue, 10, 64)
		if err == nil && cursor > 0 {
			query += fmt.Sprintf(" AND resource_version < $%d", argIndex)
			args = append(args, cursor)
			argIndex++
		}
	}

	query += " ORDER BY resource_version DESC"

	if opts.Limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", argIndex)
		args = append(args, opts.Limit+1)
	}

	rows, err := p.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", fmt.Errorf("failed to query resources: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var objects []runtime.Object
	var resourceVersions []int64

	for rows.Next() {
		var rv, generation int64
		var ns, name, uid string
		var spec, status, labels, annotations, finalizers []byte
		var createdAt time.Time

		if err := rows.Scan(&rv, &generation, &ns, &name, &uid, &spec, &status, &labels, &annotations, &finalizers, &createdAt); err != nil {
			return nil, "", fmt.Errorf("failed to scan row: %w", err)
		}

		obj, err := p.reconstructObject(kind, ns, name, rv, generation, uid, string(spec), string(status), string(labels), string(annotations), string(finalizers), createdAt)
		if err != nil {
			klog.Warningf("Failed to reconstruct object %s/%s: %v", ns, name, err)
			continue
		}

		objects = append(objects, obj)
		resourceVersions = append(resourceVersions, rv)
	}

	var continueToken string
	if opts.Limit > 0 && int64(len(objects)) > opts.Limit {
		objects = objects[:opts.Limit]
		resourceVersions = resourceVersions[:opts.Limit]
		continueToken = fmt.Sprintf("%d", resourceVersions[len(resourceVersions)-1])
	}

	return objects, continueToken, nil
}

func (p *PostgreSQLBackend) Update(ctx context.Context, kind, namespace, name string, obj runtime.Object) error {
	data, err := p.converter.Encode(obj)
	if err != nil {
		return fmt.Errorf("failed to encode object: %w", err)
	}

	var resource struct {
		Metadata struct {
			ResourceVersion string            `json:"resourceVersion"`
			Labels          map[string]string `json:"labels"`
			Annotations     map[string]string `json:"annotations"`
			Finalizers      []string          `json:"finalizers"`
		} `json:"metadata"`
		Spec   json.RawMessage `json:"spec"`
		Status json.RawMessage `json:"status"`
	}

	if err := json.Unmarshal(data, &resource); err != nil {
		return fmt.Errorf("failed to parse object: %w", err)
	}

	if resource.Metadata.Labels == nil {
		resource.Metadata.Labels = map[string]string{}
	}
	if resource.Metadata.Annotations == nil {
		resource.Metadata.Annotations = map[string]string{}
	}
	if resource.Metadata.Finalizers == nil {
		resource.Metadata.Finalizers = []string{}
	}
	labelsJSON, _ := json.Marshal(resource.Metadata.Labels)
	annotationsJSON, _ := json.Marshal(resource.Metadata.Annotations)
	finalizersJSON, _ := json.Marshal(resource.Metadata.Finalizers)

	specJSON := string(resource.Spec)
	if specJSON == "" || specJSON == jsonNull {
		specJSON = "{}"
	}
	statusJSON := string(resource.Status)
	if statusJSON == "" || statusJSON == jsonNull {
		statusJSON = "{}"
	}

	var rv int64
	if resource.Metadata.ResourceVersion != "" {
		rv, _ = strconv.ParseInt(resource.Metadata.ResourceVersion, 10, 64)
	}

	if rv == 0 {
		return fmt.Errorf("resourceVersion is required for update")
	}

	var updated, exists bool
	err = p.db.QueryRowContext(ctx, `
		WITH upd AS (
			UPDATE resources
			SET spec = $1::jsonb, status = $2::jsonb, labels = $3::jsonb, annotations = $4::jsonb,
			    finalizers = $5::jsonb, generation = generation + 1, resource_version = resource_version + 1, updated_at = NOW()
			WHERE kind = $6 AND namespace = $7 AND name = $8 AND resource_version = $9			RETURNING 1
		)
		SELECT
			(SELECT COUNT(*) > 0 FROM upd) as updated,
			(SELECT COUNT(*) > 0 FROM resources WHERE kind = $6 AND namespace = $7 AND name = $8 AND deleted_at IS NULL) as exists
	`, specJSON, statusJSON, string(labelsJSON), string(annotationsJSON), string(finalizersJSON), kind, namespace, name, rv).Scan(&updated, &exists)
	if err != nil {
		return fmt.Errorf("failed to update resource: %w", err)
	}

	if !updated {
		if exists {
			return storage.ErrConflict
		}
		return storage.ErrNotFound
	}

	return nil
}

func (p *PostgreSQLBackend) UpdateStatus(ctx context.Context, kind, namespace, name string, obj runtime.Object) error {
	data, err := p.converter.Encode(obj)
	if err != nil {
		return fmt.Errorf("failed to encode object: %w", err)
	}

	var resource struct {
		Metadata struct {
			ResourceVersion string `json:"resourceVersion"`
		} `json:"metadata"`
		Status json.RawMessage `json:"status"`
	}

	if err := json.Unmarshal(data, &resource); err != nil {
		return fmt.Errorf("failed to parse object: %w", err)
	}

	statusJSON := string(resource.Status)
	if statusJSON == "" || statusJSON == jsonNull {
		statusJSON = "{}"
	}

	var rv int64
	if resource.Metadata.ResourceVersion != "" {
		rv, _ = strconv.ParseInt(resource.Metadata.ResourceVersion, 10, 64)
	}

	if rv == 0 {
		return fmt.Errorf("resourceVersion is required for status update")
	}

	var updated, exists bool
	err = p.db.QueryRowContext(ctx, `
		WITH upd AS (
			UPDATE resources
			SET status = $1::jsonb, resource_version = resource_version + 1, updated_at = NOW()
			WHERE kind = $2 AND namespace = $3 AND name = $4 AND resource_version = $5			RETURNING 1
		)
		SELECT
			(SELECT COUNT(*) > 0 FROM upd) as updated,
			(SELECT COUNT(*) > 0 FROM resources WHERE kind = $2 AND namespace = $3 AND name = $4 AND deleted_at IS NULL) as exists
	`, statusJSON, kind, namespace, name, rv).Scan(&updated, &exists)
	if err != nil {
		return fmt.Errorf("failed to update resource status: %w", err)
	}

	if !updated {
		if exists {
			return storage.ErrConflict
		}
		return storage.ErrNotFound
	}

	return nil
}

func (p *PostgreSQLBackend) Delete(ctx context.Context, kind, namespace, name string) error {
	result, err := p.db.ExecContext(ctx, `
		DELETE FROM resources
		WHERE kind = $1 AND namespace = $2 AND name = $3
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
		WHERE kind = $1 AND namespace = $2 AND name = $3	`, kind, namespace, name).Scan(&rv)
	return rv, err
}

func (p *PostgreSQLBackend) Close() error {
	p.cancel()
	return p.db.Close()
}

func (p *PostgreSQLBackend) reconstructObject(kind, namespace, name string, rv, generation int64, uid, spec, status, labels, annotations, finalizers string, createdAt time.Time) (runtime.Object, error) {
	var labelsMap map[string]string
	var annotationsMap map[string]string
	var finalizersList []string
	_ = json.Unmarshal([]byte(labels), &labelsMap)
	_ = json.Unmarshal([]byte(annotations), &annotationsMap)
	_ = json.Unmarshal([]byte(finalizers), &finalizersList)

	metadata := map[string]interface{}{
		"name":              name,
		"namespace":         namespace,
		"uid":               uid,
		"resourceVersion":   fmt.Sprintf("%d", rv),
		"generation":        generation,
		"creationTimestamp": createdAt.Format(time.RFC3339),
		"labels":            labelsMap,
		"annotations":       annotationsMap,
	}
	if len(finalizersList) > 0 {
		metadata["finalizers"] = finalizersList
	}

	obj := map[string]interface{}{
		"apiVersion": p.converter.APIVersion(kind),
		"kind":       kind,
		"metadata":   metadata,
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
