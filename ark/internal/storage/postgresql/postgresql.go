/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/lib/pq"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/fields"
	k8slabels "k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/selection"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/klog/v2"

	"mckinsey.com/ark/internal/storage"
)

const jsonNull = "null"

// fieldPredicate is a validated (column, op, value) triple derived from a client-
// supplied field selector. columns come from supportedFieldColumns (never client
// input), so composing SQL by concatenating column and op is safe from injection.
type fieldPredicate struct {
	column string
	op     string
	value  string
}

// supportedFieldColumns maps k8s field selectors to the resources table
// column they filter on. Resource-specific fields (e.g. status.phase) are
// rejected pending typed field indexers — not permanently forbidden.
var supportedFieldColumns = map[string]string{
	"metadata.name":      "name",
	"metadata.namespace": "namespace",
}

var supportedFieldOps = map[selection.Operator]string{
	selection.Equals:       "=",
	selection.DoubleEquals: "=",
	selection.NotEquals:    "<>",
}

func supportedFieldsList() string {
	keys := make([]string, 0, len(supportedFieldColumns))
	for k := range supportedFieldColumns {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return strings.Join(keys, ", ")
}

func supportedFieldOpsList() string {
	keys := make([]string, 0, len(supportedFieldOps))
	for k := range supportedFieldOps {
		keys = append(keys, string(k))
	}
	sort.Strings(keys)
	return strings.Join(keys, ", ")
}

// parseFieldSelector validates opts.FieldSelector and returns SQL predicates for
// supported metadata fields. Unsupported fields or operators produce storage.ErrInvalidRequest.
// Additional fields can be added by extending supportedFieldColumns.
func parseFieldSelector(selector string) ([]fieldPredicate, error) {
	if selector == "" {
		return nil, nil
	}
	sel, err := fields.ParseSelector(selector)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid field selector %q: %v", storage.ErrInvalidRequest, selector, err)
	}
	if sel.Empty() {
		return nil, nil
	}
	reqs := sel.Requirements()
	preds := make([]fieldPredicate, 0, len(reqs))
	for _, req := range reqs {
		col, ok := supportedFieldColumns[req.Field]
		if !ok {
			return nil, fmt.Errorf("%w: field selector on %q is not yet implemented for the PostgreSQL backend (currently supported: %s)", storage.ErrInvalidRequest, req.Field, supportedFieldsList())
		}
		op, ok := supportedFieldOps[req.Operator]
		if !ok {
			return nil, fmt.Errorf("%w: field selector operator %q is not yet implemented (currently supported: %s)", storage.ErrInvalidRequest, req.Operator, supportedFieldOpsList())
		}
		preds = append(preds, fieldPredicate{column: col, op: op, value: req.Value})
	}
	return preds, nil
}

func parseLabelSelector(selector string) (k8slabels.Selector, error) {
	if selector == "" {
		return nil, nil
	}
	sel, err := k8slabels.Parse(selector)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid label selector %q: %v", storage.ErrInvalidRequest, selector, err)
	}
	if sel.Empty() {
		return nil, nil
	}
	return sel, nil
}

// labelSelectorSQL emits " AND ..." clauses and appends bind values to *args.
// Placeholders are len(*args)+1 at each use, so the caller passes the same
// slice and doesn't track an index. Values are bound; operators are fixed.
func labelSelectorSQL(sel k8slabels.Selector, args *[]interface{}) string {
	if sel == nil || sel.Empty() {
		return ""
	}
	reqs, _ := sel.Requirements()
	var sb strings.Builder
	for _, req := range reqs {
		key := req.Key()
		op := req.Operator()
		vals := req.Values().List()
		p := len(*args) + 1
		switch op {
		case selection.Equals, selection.DoubleEquals:
			fmt.Fprintf(&sb, ` AND labels->>$%d = $%d`, p, p+1)
			*args = append(*args, key, vals[0])
		case selection.NotEquals:
			fmt.Fprintf(&sb, ` AND (labels->>$%d IS NULL OR labels->>$%d <> $%d)`, p, p, p+1)
			*args = append(*args, key, vals[0])
		case selection.In:
			fmt.Fprintf(&sb, ` AND labels->>$%d = ANY($%d::text[])`, p, p+1)
			*args = append(*args, key, pq.Array(vals))
		case selection.NotIn:
			fmt.Fprintf(&sb, ` AND (labels->>$%d IS NULL OR labels->>$%d <> ALL($%d::text[]))`, p, p, p+1)
			*args = append(*args, key, pq.Array(vals))
		case selection.Exists:
			fmt.Fprintf(&sb, ` AND labels->>$%d IS NOT NULL`, p)
			*args = append(*args, key)
		case selection.DoesNotExist:
			fmt.Fprintf(&sb, ` AND labels->>$%d IS NULL`, p)
			*args = append(*args, key)
		default:
			panic(fmt.Sprintf("labelSelectorSQL: unhandled operator %q from k8slabels.Parse output", op))
		}
	}
	return sb.String()
}

type Config struct {
	Host         string
	Port         int
	Database     string
	User         string
	Password     string
	SSLMode      string
	MaxOpenConns int
	MaxIdleConns int
}

type PostgreSQLBackend struct {
	db        *sql.DB
	connStr   string
	converter storage.TypeConverter
	watchers  map[string][]*postgresWatcher
	mu        sync.RWMutex
	ctx       context.Context
	cancel    context.CancelFunc
	cachedRV  atomic.Int64
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

	if cfg.MaxOpenConns == 0 {
		cfg.MaxOpenConns = 40
	}
	if cfg.MaxIdleConns == 0 {
		cfg.MaxIdleConns = cfg.MaxOpenConns / 2
	}
	db.SetMaxOpenConns(cfg.MaxOpenConns)
	db.SetMaxIdleConns(cfg.MaxIdleConns)
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
		watchers:  make(map[string][]*postgresWatcher),
		ctx:       ctx,
		cancel:    cancel,
	}

	if err := backend.initSchema(); err != nil {
		_ = db.Close()
		cancel()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	backend.warmPool()
	go backend.startWALConsumer()
	go backend.refreshBookmarkLoop()
	go backend.cleanupLoop()

	return backend, nil
}

func (p *PostgreSQLBackend) warmPool() {
	var wg sync.WaitGroup
	for range min(p.db.Stats().MaxOpenConnections, 20) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			conn, err := p.db.Conn(context.Background())
			if err != nil {
				return
			}
			_ = conn.PingContext(context.Background())
			_ = conn.Close()
		}()
	}
	wg.Wait()
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
		deleted_at TIMESTAMPTZ
	);
	ALTER TABLE resources ADD COLUMN IF NOT EXISTS finalizers JSONB DEFAULT '[]';
	ALTER TABLE resources ADD COLUMN IF NOT EXISTS owner_references JSONB DEFAULT '[]';
	ALTER TABLE resources ADD COLUMN IF NOT EXISTS deletion_timestamp TIMESTAMPTZ;

	ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_kind_namespace_name_key;
	CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_unique_active ON resources(kind, namespace, name) WHERE deleted_at IS NULL;

	CREATE INDEX IF NOT EXISTS idx_resources_kind_namespace ON resources(kind, namespace);
	CREATE INDEX IF NOT EXISTS idx_resources_kind_namespace_name ON resources(kind, namespace, name);
	CREATE INDEX IF NOT EXISTS idx_resources_labels ON resources USING GIN(labels);
	CREATE INDEX IF NOT EXISTS idx_resources_lookup ON resources(kind, namespace, name, resource_version);
	CREATE INDEX IF NOT EXISTS idx_resources_deleted ON resources(deleted_at) WHERE deleted_at IS NOT NULL;

	DROP TRIGGER IF EXISTS resource_change_trigger ON resources;
	DROP FUNCTION IF EXISTS notify_resource_change();

	DO $$ BEGIN
		IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'ark_cdc') THEN
			CREATE PUBLICATION ark_cdc FOR TABLE resources;
		END IF;
	END $$;
	`
	_, err := p.db.Exec(schema)
	return err
}

// startWALConsumer and runWALConsumer are in wal_consumer.go

func (p *PostgreSQLBackend) refreshBookmarkLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	p.refreshCachedRV()

	for {
		select {
		case <-p.ctx.Done():
			return
		case <-ticker.C:
			p.refreshCachedRV()
		}
	}
}

func (p *PostgreSQLBackend) refreshCachedRV() {
	rv, err := p.getMaxResourceVersion()
	if err != nil {
		return
	}
	p.cachedRV.Store(rv)
}

func (p *PostgreSQLBackend) cleanupLoop() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-p.ctx.Done():
			return
		case <-ticker.C:
			_, _ = p.db.ExecContext(p.ctx, `DELETE FROM resources WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '5 minutes'`)
		}
	}
}

func (p *PostgreSQLBackend) Create(ctx context.Context, kind, namespace, name string, obj runtime.Object) error {
	data, err := p.converter.Encode(obj)
	if err != nil {
		return fmt.Errorf("failed to encode object: %w", err)
	}

	var resource struct {
		Metadata struct {
			UID             string            `json:"uid"`
			Labels          map[string]string `json:"labels"`
			Annotations     map[string]string `json:"annotations"`
			Finalizers      []string          `json:"finalizers"`
			OwnerReferences json.RawMessage   `json:"ownerReferences"`
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
	ownerRefsJSON := string(resource.Metadata.OwnerReferences)
	if ownerRefsJSON == "" || ownerRefsJSON == jsonNull {
		ownerRefsJSON = "[]"
	}

	specJSON := string(resource.Spec)
	if specJSON == "" || specJSON == jsonNull {
		specJSON = "{}"
	}
	statusJSON := string(resource.Status)
	if statusJSON == "" || statusJSON == jsonNull {
		statusJSON = "{}"
	}

	var rv, generation int64
	var createdAt time.Time
	err = p.db.QueryRowContext(ctx, `
		INSERT INTO resources (kind, namespace, name, uid, spec, status, labels, annotations, finalizers, owner_references)
		VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb)
		RETURNING resource_version, generation, created_at
	`, kind, namespace, name, resource.Metadata.UID, specJSON, statusJSON, string(labelsJSON), string(annotationsJSON), string(finalizersJSON), ownerRefsJSON).Scan(&rv, &generation, &createdAt)
	if err != nil {
		if pgErr, ok := err.(*pq.Error); ok && pgErr.Code == "23505" {
			return storage.ErrAlreadyExists
		}
		return fmt.Errorf("failed to insert resource: %w", err)
	}

	return nil
}

func (p *PostgreSQLBackend) Get(ctx context.Context, kind, namespace, name string) (runtime.Object, error) {
	row := p.db.QueryRowContext(ctx, `
		SELECT resource_version, generation, uid, spec, status, labels, annotations, finalizers, owner_references, created_at, updated_at, deletion_timestamp
		FROM resources
		WHERE kind = $1 AND namespace = $2 AND name = $3 AND deleted_at IS NULL`, kind, namespace, name)

	var rv, generation int64
	var uid string
	var spec, status, labels, annotations, finalizers, ownerRefs []byte
	var createdAt, updatedAt time.Time
	var deletionTimestamp sql.NullTime

	if err := row.Scan(&rv, &generation, &uid, &spec, &status, &labels, &annotations, &finalizers, &ownerRefs, &createdAt, &updatedAt, &deletionTimestamp); err != nil {
		if err == sql.ErrNoRows {
			return nil, storage.ErrNotFound
		}
		return nil, fmt.Errorf("failed to scan row: %w", err)
	}

	return p.reconstructObject(kind, namespace, name, rv, generation, uid, string(spec), string(status), string(labels), string(annotations), string(finalizers), string(ownerRefs), createdAt, nullTimePtr(deletionTimestamp))
}

func (p *PostgreSQLBackend) List(ctx context.Context, kind, namespace string, opts storage.ListOptions) ([]runtime.Object, string, error) {
	query := `
		SELECT resource_version, generation, namespace, name, uid, spec, status, labels, annotations, finalizers, owner_references, created_at, deletion_timestamp
		FROM resources
		WHERE kind = $1 AND deleted_at IS NULL`
	args := []interface{}{kind}
	argIndex := 2

	if namespace != "" {
		query += fmt.Sprintf(" AND namespace = $%d", argIndex)
		args = append(args, namespace)
		argIndex++
	}

	labelSel, err := parseLabelSelector(opts.LabelSelector)
	if err != nil {
		return nil, "", err
	}
	if labelSel != nil {
		query += labelSelectorSQL(labelSel, &args)
		argIndex = len(args) + 1
	}

	fieldPreds, err := parseFieldSelector(opts.FieldSelector)
	if err != nil {
		return nil, "", err
	}
	for _, p := range fieldPreds {
		query += fmt.Sprintf(" AND %s %s $%d", p.column, p.op, argIndex)
		args = append(args, p.value)
		argIndex++
	}

	if opts.Continue != "" {
		cursor, err := strconv.ParseInt(opts.Continue, 10, 64)
		if err == nil && cursor > 0 {
			// NOTE: paginated LIST has a known weak-consistency edge case across pages
			// due to the BIGSERIAL commit-order race documented in postgresWatcher.relist.
			// A row whose creating transaction was in-flight during page N's snapshot
			// can commit before page N+1 and not be returned by either page. The proper
			// fix is snapshot-based pagination (pg_export_snapshot + REPEATABLE READ).
			// Bites only when total result > opts.Limit (typically 500). Tracked separately.
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
		var spec, status, labels, annotations, finalizers, ownerRefs []byte
		var createdAt time.Time
		var deletionTimestamp sql.NullTime

		if err := rows.Scan(&rv, &generation, &ns, &name, &uid, &spec, &status, &labels, &annotations, &finalizers, &ownerRefs, &createdAt, &deletionTimestamp); err != nil {
			return nil, "", fmt.Errorf("failed to scan row: %w", err)
		}

		obj, err := p.reconstructObject(kind, ns, name, rv, generation, uid, string(spec), string(status), string(labels), string(annotations), string(finalizers), string(ownerRefs), createdAt, nullTimePtr(deletionTimestamp))
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
			ResourceVersion   string            `json:"resourceVersion"`
			Labels            map[string]string `json:"labels"`
			Annotations       map[string]string `json:"annotations"`
			Finalizers        []string          `json:"finalizers"`
			OwnerReferences   json.RawMessage   `json:"ownerReferences"`
			DeletionTimestamp *string           `json:"deletionTimestamp"`
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
	ownerRefsJSON := string(resource.Metadata.OwnerReferences)
	if ownerRefsJSON == "" || ownerRefsJSON == jsonNull {
		ownerRefsJSON = "[]"
	}

	// deletionTimestamp is set-once: once a graceful delete records it, normal
	// updates that omit it (most reconciles) must not clear it. COALESCE in the
	// UPDATE keeps the stored value whenever the incoming object has none.
	var deletionTS interface{}
	if resource.Metadata.DeletionTimestamp != nil && *resource.Metadata.DeletionTimestamp != "" {
		deletionTS = *resource.Metadata.DeletionTimestamp
	}

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

	var newRV, newGen int64
	var uid string
	var createdAt time.Time
	var updated bool
	err = p.db.QueryRowContext(ctx, `
		WITH upd AS (
			UPDATE resources
			SET spec = $1::jsonb, status = $2::jsonb, labels = $3::jsonb, annotations = $4::jsonb,
			    finalizers = $5::jsonb, owner_references = $6::jsonb,
			    deletion_timestamp = COALESCE($7::timestamptz, deletion_timestamp),
			    generation = generation + 1, resource_version = nextval('resources_resource_version_seq'), updated_at = NOW()
			WHERE kind = $8 AND namespace = $9 AND name = $10 AND resource_version = $11 AND deleted_at IS NULL
			RETURNING resource_version, generation, uid, created_at
		)
		SELECT resource_version, generation, uid, created_at, true FROM upd
		UNION ALL
		SELECT 0, 0, '', NOW(), false WHERE NOT EXISTS (SELECT 1 FROM upd)
	`, specJSON, statusJSON, string(labelsJSON), string(annotationsJSON), string(finalizersJSON), ownerRefsJSON, deletionTS, kind, namespace, name, rv).Scan(&newRV, &newGen, &uid, &createdAt, &updated)
	if err != nil {
		return fmt.Errorf("failed to update resource: %w", err)
	}

	if !updated {
		var exists bool
		_ = p.db.QueryRowContext(ctx, `SELECT COUNT(*) > 0 FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3 AND deleted_at IS NULL`, kind, namespace, name).Scan(&exists)
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

	var newRV int64
	var updated bool
	err = p.db.QueryRowContext(ctx, `
		WITH upd AS (
			UPDATE resources
			SET status = $1::jsonb, resource_version = nextval('resources_resource_version_seq'), updated_at = NOW()
			WHERE kind = $2 AND namespace = $3 AND name = $4 AND resource_version = $5 AND deleted_at IS NULL
			RETURNING resource_version
		)
		SELECT resource_version, true FROM upd
		UNION ALL
		SELECT 0, false WHERE NOT EXISTS (SELECT 1 FROM upd)
	`, statusJSON, kind, namespace, name, rv).Scan(&newRV, &updated)
	if err != nil {
		return fmt.Errorf("failed to update resource status: %w", err)
	}

	if !updated {
		var exists bool
		_ = p.db.QueryRowContext(ctx, `SELECT COUNT(*) > 0 FROM resources WHERE kind = $1 AND namespace = $2 AND name = $3 AND deleted_at IS NULL`, kind, namespace, name).Scan(&exists)
		if exists {
			return storage.ErrConflict
		}
		return storage.ErrNotFound
	}

	return nil
}

func (p *PostgreSQLBackend) Delete(ctx context.Context, kind, namespace, name string) error {
	result, err := p.db.ExecContext(ctx, `
		UPDATE resources
		SET deleted_at = NOW(), resource_version = nextval('resources_resource_version_seq'), updated_at = NOW()
		WHERE kind = $1 AND namespace = $2 AND name = $3 AND deleted_at IS NULL
	`, kind, namespace, name)
	if err != nil {
		return fmt.Errorf("failed to delete resource: %w", err)
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		return storage.ErrNotFound
	}

	return nil
}

func (p *PostgreSQLBackend) Watch(ctx context.Context, kind, namespace string, opts storage.WatchOptions) (watch.Interface, error) {
	key := fmt.Sprintf("%s/%s", kind, namespace)

	labelSel, err := parseLabelSelector(opts.LabelSelector)
	if err != nil {
		return nil, err
	}

	fieldPreds, err := parseFieldSelector(opts.FieldSelector)
	if err != nil {
		return nil, err
	}

	w := &postgresWatcher{
		outCh:       make(chan watch.Event, 100),
		nudgeCh:     make(chan struct{}, 1),
		backend:     p,
		key:         key,
		kind:        kind,
		ns:          namespace,
		labelSel:    labelSel,
		fieldPreds:  fieldPreds,
		ctx:         ctx,
		done:        make(chan struct{}),
		initialList: true,
		seenRVs:     make(map[string]int64),
	}

	p.mu.Lock()
	p.watchers[key] = append(p.watchers[key], w)
	p.mu.Unlock()

	go w.run()

	return w, nil
}

func (p *PostgreSQLBackend) GetResourceVersion(ctx context.Context, kind, namespace, name string) (int64, error) {
	var rv int64
	err := p.db.QueryRowContext(ctx, `
		SELECT resource_version FROM resources
		WHERE kind = $1 AND namespace = $2 AND name = $3 AND deleted_at IS NULL`, kind, namespace, name).Scan(&rv)
	return rv, err
}

func (p *PostgreSQLBackend) Close() error {
	p.cancel()
	return p.db.Close()
}

func nullTimePtr(t sql.NullTime) *time.Time {
	if !t.Valid {
		return nil
	}
	return &t.Time
}

func (p *PostgreSQLBackend) reconstructObject(kind, namespace, name string, rv, generation int64, uid, spec, status, labels, annotations, finalizers, ownerRefs string, createdAt time.Time, deletionTimestamp *time.Time) (runtime.Object, error) {
	var labelsMap map[string]string
	var annotationsMap map[string]string
	var finalizersList []string
	var ownerRefsList []interface{}
	_ = json.Unmarshal([]byte(labels), &labelsMap)
	_ = json.Unmarshal([]byte(annotations), &annotationsMap)
	_ = json.Unmarshal([]byte(finalizers), &finalizersList)
	_ = json.Unmarshal([]byte(ownerRefs), &ownerRefsList)

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
	if len(ownerRefsList) > 0 {
		metadata["ownerReferences"] = ownerRefsList
	}
	if deletionTimestamp != nil {
		metadata["deletionTimestamp"] = deletionTimestamp.UTC().Format(time.RFC3339)
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

func (p *PostgreSQLBackend) nudgeWatchersByKindNamespace(kind, namespace string) {
	key := fmt.Sprintf("%s/%s", kind, namespace)
	allKey := fmt.Sprintf("%s/", kind)

	p.mu.RLock()
	watchers := make([]*postgresWatcher, 0, len(p.watchers[key])+len(p.watchers[allKey]))
	watchers = append(watchers, p.watchers[key]...)
	if namespace != "" {
		watchers = append(watchers, p.watchers[allKey]...)
	}
	p.mu.RUnlock()

	for _, w := range watchers {
		select {
		case w.nudgeCh <- struct{}{}:
		default:
		}
	}
}

func (p *PostgreSQLBackend) nudgeAllWatchers() {
	p.mu.RLock()
	defer p.mu.RUnlock()
	for _, watchers := range p.watchers {
		for _, w := range watchers {
			select {
			case w.nudgeCh <- struct{}{}:
			default:
			}
		}
	}
}

func (p *PostgreSQLBackend) removeWatcher(key string, w *postgresWatcher) {
	p.mu.Lock()
	defer p.mu.Unlock()

	watchers := p.watchers[key]
	for i, existing := range watchers {
		if existing == w {
			p.watchers[key] = append(watchers[:i], watchers[i+1:]...)
			break
		}
	}
}

func (p *PostgreSQLBackend) getMaxResourceVersion() (int64, error) {
	var rv sql.NullInt64
	err := p.db.QueryRowContext(p.ctx, `SELECT MAX(resource_version) FROM resources`).Scan(&rv)
	if err != nil {
		return 0, err
	}
	if !rv.Valid {
		return 0, nil
	}
	return rv.Int64, nil
}

type postgresWatcher struct {
	outCh           chan watch.Event
	nudgeCh         chan struct{}
	backend         *PostgreSQLBackend
	key             string
	kind            string
	ns              string
	labelSel        k8slabels.Selector
	fieldPreds      []fieldPredicate
	ctx             context.Context
	done            chan struct{}
	stopped         atomic.Bool
	closed          sync.Once
	lastSeenRV      atomic.Int64
	initialList     bool
	initialListDone bool
	// seenRVs maps a resource UID to the highest rv we've already emitted for it.
	// Combined with the lookback window in relist(), this lets us re-fetch rows that
	// might have been invisible during a prior relist (because their txn was still
	// in flight) without re-emitting events the consumer already saw.
	seenMu  sync.Mutex
	seenRVs map[string]int64
}

func (w *postgresWatcher) Stop() {
	if w.stopped.Swap(true) {
		return
	}
	w.backend.removeWatcher(w.key, w)
	w.closed.Do(func() {
		close(w.done)
	})
}

func (w *postgresWatcher) ResultChan() <-chan watch.Event {
	return w.outCh
}

func (w *postgresWatcher) run() {
	defer close(w.outCh)

	w.relist()
	w.sendBookmark()

	bookmarkTicker := time.NewTicker(30 * time.Second)
	defer bookmarkTicker.Stop()

	relistTicker := time.NewTicker(120 * time.Second)
	defer relistTicker.Stop()

	for {
		select {
		case <-w.done:
			return
		case <-w.ctx.Done():
			return
		case <-bookmarkTicker.C:
			w.sendBookmark()
		case <-relistTicker.C:
			w.relist()
		case <-w.nudgeCh:
			w.relist()
		}
	}
}

func (w *postgresWatcher) sendBookmark() {
	rv := w.backend.cachedRV.Load()
	if lastSeen := w.lastSeenRV.Load(); lastSeen > rv {
		rv = lastSeen
	}
	if rv == 0 {
		return
	}
	obj := w.backend.converter.NewObject(w.kind)
	if obj == nil {
		return
	}
	if accessor, aErr := meta.Accessor(obj); aErr == nil {
		accessor.SetResourceVersion(fmt.Sprintf("%d", rv))
		if !w.initialListDone {
			accessor.SetAnnotations(map[string]string{"k8s.io/initial-events-end": "true"})
			w.initialListDone = true
		}
	}
	select {
	case w.outCh <- watch.Event{Type: watch.Bookmark, Object: obj}:
	default:
	}
}

func (w *postgresWatcher) advanceRV(rv int64) {
	for {
		current := w.lastSeenRV.Load()
		if rv <= current {
			return
		}
		if w.lastSeenRV.CompareAndSwap(current, rv) {
			return
		}
	}
}

// markSeen returns true if rv should be skipped because we've already emitted
// this uid at the same or higher rv. Otherwise records rv as the latest.
func (w *postgresWatcher) markSeen(uid string, rv int64) bool {
	w.seenMu.Lock()
	defer w.seenMu.Unlock()
	if seen, ok := w.seenRVs[uid]; ok && seen >= rv {
		return true
	}
	w.seenRVs[uid] = rv
	return false
}

func (w *postgresWatcher) hasSeenUID(uid string) bool {
	w.seenMu.Lock()
	defer w.seenMu.Unlock()
	_, ok := w.seenRVs[uid]
	return ok
}

// pruneSeen drops seenRVs entries far below the current cursor, bounding memory.
func (w *postgresWatcher) pruneSeen() {
	pruneFloor := w.lastSeenRV.Load() - 5000
	if pruneFloor <= 0 {
		return
	}
	w.seenMu.Lock()
	defer w.seenMu.Unlock()
	for uid, rv := range w.seenRVs {
		if rv < pruneFloor {
			delete(w.seenRVs, uid)
		}
	}
}

func (w *postgresWatcher) buildRelistQuery() (string, []interface{}) {
	const lookback int64 = 500
	queryFromRV := w.lastSeenRV.Load() - lookback
	if queryFromRV < 0 {
		queryFromRV = 0
	}

	query := `
		SELECT resource_version, generation, namespace, name, uid, spec, status, labels, annotations, finalizers, owner_references, created_at, deleted_at, deletion_timestamp
		FROM resources
		WHERE kind = $1 AND resource_version > $2`
	args := []interface{}{w.kind, queryFromRV}
	argIndex := 3

	if w.ns != "" {
		query += fmt.Sprintf(` AND namespace = $%d`, argIndex)
		args = append(args, w.ns)
		argIndex++
	}
	if w.labelSel != nil {
		query += labelSelectorSQL(w.labelSel, &args)
		argIndex = len(args) + 1
	}
	for _, p := range w.fieldPreds {
		query += fmt.Sprintf(` AND %s %s $%d`, p.column, p.op, argIndex)
		args = append(args, p.value)
		argIndex++
	}
	query += ` ORDER BY resource_version ASC`
	return query, args
}

// emitRow sends a single relist row downstream. Returns false if the watcher
// should stop iterating (done/cancelled).
func (w *postgresWatcher) emitRow(rv, generation int64, ns, name, uid string, spec, status, labels, annotations, finalizers, ownerRefs []byte, createdAt time.Time, deletedAt, deletionTimestamp sql.NullTime) bool {
	uidNew := !w.hasSeenUID(uid)
	if w.markSeen(uid, rv) {
		return true
	}
	obj, err := w.backend.reconstructObject(w.kind, ns, name, rv, generation, uid, string(spec), string(status), string(labels), string(annotations), string(finalizers), string(ownerRefs), createdAt, nullTimePtr(deletionTimestamp))
	if err != nil {
		return true
	}
	var eventType watch.EventType
	switch {
	case deletedAt.Valid:
		eventType = watch.Deleted
	case uidNew:
		eventType = watch.Added
	default:
		eventType = watch.Modified
	}
	w.advanceRV(rv)
	select {
	case w.outCh <- watch.Event{Type: eventType, Object: obj}:
		return true
	case <-w.done:
		return false
	case <-w.ctx.Done():
		return false
	}
}

func (w *postgresWatcher) relist() {
	// FIX: BIGSERIAL resource_versions are assigned at INSERT statement time, but row
	// visibility depends on COMMIT time. Two concurrent INSERTs can commit in the
	// opposite order from rv assignment, so a strict `rv > lastSeenRV` cursor can skip
	// past an in-flight rv permanently. Mitigation: re-query with a lookback window,
	// then dedup by (uid, rv) using w.seenRVs to avoid double-emitting.
	query, args := w.buildRelistQuery()
	rows, err := w.backend.db.QueryContext(w.ctx, query, args...)
	if err != nil {
		return
	}
	defer func() { _ = rows.Close() }()

	for rows.Next() {
		var rv, generation int64
		var ns, name, uid string
		var spec, status, labels, annotations, finalizers, ownerRefs []byte
		var createdAt time.Time
		var deletedAt, deletionTimestamp sql.NullTime

		if err := rows.Scan(&rv, &generation, &ns, &name, &uid, &spec, &status, &labels, &annotations, &finalizers, &ownerRefs, &createdAt, &deletedAt, &deletionTimestamp); err != nil {
			return
		}
		if !w.emitRow(rv, generation, ns, name, uid, spec, status, labels, annotations, finalizers, ownerRefs, createdAt, deletedAt, deletionTimestamp) {
			return
		}
	}
	w.pruneSeen()

	if w.initialList {
		w.initialList = false
	}
}
