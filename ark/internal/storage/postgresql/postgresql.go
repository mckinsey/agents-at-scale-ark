/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"database/sql"
	"encoding/base64"
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
	SSLRootCert  string
	SSLCert      string
	SSLKey       string
	MaxOpenConns int
	MaxIdleConns int
}

type PostgreSQLBackend struct {
	db        *sql.DB
	connStr   string
	converter storage.TypeConverter
	// broadcasters holds one in-process watch cache per kind (see broadcaster.go).
	// mu guards the map; a broadcaster is created lazily on first Watch of a kind
	// and removed when its last watcher unsubscribes.
	broadcasters map[string]*kindBroadcaster
	mu           sync.RWMutex
	ctx          context.Context
	cancel       context.CancelFunc
	cachedRV     atomic.Int64
}

var connValueEscaper = strings.NewReplacer(`\`, `\\`, `'`, `\'`)

func quoteConnValue(v string) string {
	return "'" + connValueEscaper.Replace(v) + "'"
}

func buildConnString(cfg Config) string {
	parts := []string{
		"host=" + quoteConnValue(cfg.Host),
		"port=" + strconv.Itoa(cfg.Port),
		"user=" + quoteConnValue(cfg.User),
		"password=" + quoteConnValue(cfg.Password),
		"dbname=" + quoteConnValue(cfg.Database),
		"sslmode=" + quoteConnValue(cfg.SSLMode),
	}
	if cfg.SSLRootCert != "" {
		parts = append(parts, "sslrootcert="+quoteConnValue(cfg.SSLRootCert))
	}
	if cfg.SSLCert != "" {
		parts = append(parts, "sslcert="+quoteConnValue(cfg.SSLCert))
	}
	if cfg.SSLKey != "" {
		parts = append(parts, "sslkey="+quoteConnValue(cfg.SSLKey))
	}
	return strings.Join(parts, " ")
}

func New(cfg Config, converter storage.TypeConverter) (*PostgreSQLBackend, error) {
	if cfg.SSLMode == "" {
		cfg.SSLMode = "require"
	}
	if cfg.Port == 0 {
		cfg.Port = 5432
	}

	connStr := buildConnString(cfg)

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
		db:           db,
		connStr:      connStr,
		converter:    converter,
		broadcasters: make(map[string]*kindBroadcaster),
		ctx:          ctx,
		cancel:       cancel,
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

type listContinueToken struct {
	Snapshot string `json:"s"`
	Cursor   int64  `json:"c"`
}

func encodeListContinueToken(tok listContinueToken) string {
	raw, err := json.Marshal(tok)
	if err != nil {
		panic(fmt.Errorf("encode continue token: %w", err))
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

// decodeListContinueToken also accepts the legacy plain-integer form emitted
// before snapshot-based pagination, so in-flight clients survive the upgrade.
func decodeListContinueToken(s string) (listContinueToken, error) {
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		// Empty Snapshot signals cursor-only pagination for legacy callers.
		return listContinueToken{Cursor: n}, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return listContinueToken{}, fmt.Errorf("invalid continue token: %w", err)
	}
	var tok listContinueToken
	if err := json.Unmarshal(raw, &tok); err != nil {
		return listContinueToken{}, fmt.Errorf("invalid continue token payload: %w", err)
	}
	return tok, nil
}

// List returns resources in descending resource_version order. Page 1 captures
// pg_current_snapshot() and the continue token carries it forward so later
// pages filter to rows visible in that snapshot, keeping the paginated view
// consistent under concurrent inserts.
func (p *PostgreSQLBackend) List(ctx context.Context, kind, namespace string, opts storage.ListOptions) ([]runtime.Object, string, error) {
	var contTok listContinueToken
	if opts.Continue != "" {
		var err error
		contTok, err = decodeListContinueToken(opts.Continue)
		if err != nil {
			return nil, "", err
		}
	}

	query, args, err := p.buildListQuery(kind, namespace, opts, contTok)
	if err != nil {
		return nil, "", err
	}

	rows, err := p.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, "", fmt.Errorf("failed to query resources: %w", err)
	}
	defer func() { _ = rows.Close() }()

	firstPage := contTok.Snapshot == ""
	objects, resourceVersions, pageSnapshot, err := p.scanListRows(rows, kind, firstPage)
	if err != nil {
		return nil, "", err
	}

	if firstPage && pageSnapshot == "" {
		if err := p.db.QueryRowContext(ctx, "SELECT pg_current_snapshot()::text").Scan(&pageSnapshot); err != nil {
			return nil, "", fmt.Errorf("failed to capture pg_current_snapshot: %w", err)
		}
	}
	if !firstPage {
		pageSnapshot = contTok.Snapshot
	}

	var continueToken string
	if opts.Limit > 0 && int64(len(objects)) > opts.Limit {
		objects = objects[:opts.Limit]
		resourceVersions = resourceVersions[:opts.Limit]
		continueToken = encodeListContinueToken(listContinueToken{
			Snapshot: pageSnapshot,
			Cursor:   resourceVersions[len(resourceVersions)-1],
		})
	}

	return objects, continueToken, nil
}

func (p *PostgreSQLBackend) buildListQuery(kind, namespace string, opts storage.ListOptions, contTok listContinueToken) (string, []interface{}, error) {
	selectCols := "resource_version, generation, namespace, name, uid, spec, status, labels, annotations, finalizers, owner_references, created_at, deletion_timestamp"
	if contTok.Snapshot == "" {
		selectCols += ", pg_current_snapshot()::text"
	}

	query := `SELECT ` + selectCols + `
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
		return "", nil, err
	}
	if labelSel != nil {
		query += labelSelectorSQL(labelSel, &args)
		argIndex = len(args) + 1
	}

	fieldPreds, err := parseFieldSelector(opts.FieldSelector)
	if err != nil {
		return "", nil, err
	}
	for _, pred := range fieldPreds {
		query += fmt.Sprintf(" AND %s %s $%d", pred.column, pred.op, argIndex)
		args = append(args, pred.value)
		argIndex++
	}

	if contTok.Cursor > 0 {
		query += fmt.Sprintf(" AND resource_version < $%d", argIndex)
		args = append(args, contTok.Cursor)
		argIndex++
	}
	if contTok.Snapshot != "" {
		query += fmt.Sprintf(" AND pg_visible_in_snapshot(xmin::text::xid8, $%d::pg_snapshot)", argIndex)
		args = append(args, contTok.Snapshot)
		argIndex++
	}

	query += " ORDER BY resource_version DESC"
	if opts.Limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", argIndex)
		args = append(args, opts.Limit+1)
	}
	return query, args, nil
}

func (p *PostgreSQLBackend) scanListRows(rows *sql.Rows, kind string, firstPage bool) ([]runtime.Object, []int64, string, error) {
	var objects []runtime.Object
	var resourceVersions []int64
	var pageSnapshot string
	for rows.Next() {
		var rv, generation int64
		var ns, name, uid string
		var spec, status, labels, annotations, finalizers, ownerRefs []byte
		var createdAt time.Time
		var deletionTimestamp sql.NullTime

		scanTargets := []interface{}{&rv, &generation, &ns, &name, &uid, &spec, &status, &labels, &annotations, &finalizers, &ownerRefs, &createdAt, &deletionTimestamp}
		var snap string
		if firstPage {
			scanTargets = append(scanTargets, &snap)
		}
		if err := rows.Scan(scanTargets...); err != nil {
			return nil, nil, "", fmt.Errorf("failed to scan row: %w", err)
		}
		if firstPage && pageSnapshot == "" {
			pageSnapshot = snap
		}

		obj, err := p.reconstructObject(kind, ns, name, rv, generation, uid, string(spec), string(status), string(labels), string(annotations), string(finalizers), string(ownerRefs), createdAt, nullTimePtr(deletionTimestamp))
		if err != nil {
			klog.Warningf("Failed to reconstruct object %s/%s: %v", ns, name, err)
			continue
		}

		objects = append(objects, obj)
		resourceVersions = append(resourceVersions, rv)
	}
	return objects, resourceVersions, pageSnapshot, nil
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
	// generation bumps on the two transitions upstream Kubernetes bumps on: a
	// spec change, and the first time deletionTimestamp is set (rest.BeforeDelete).
	// The CASE reads OLD row values on the RHS (per PostgreSQL SET semantics),
	// so `deletion_timestamp IS NULL` detects the marking transition; a reconcile
	// that re-sends an existing timestamp does not bump. jsonb equality is
	// structural, so re-marshalled specs with reordered keys don't false-bump.
	err = p.db.QueryRowContext(ctx, `
		WITH upd AS (
			UPDATE resources
			SET spec = $1::jsonb, status = $2::jsonb, labels = $3::jsonb, annotations = $4::jsonb,
			    finalizers = $5::jsonb, owner_references = $6::jsonb,
			    deletion_timestamp = COALESCE($7::timestamptz, deletion_timestamp),
			    generation = CASE WHEN spec IS DISTINCT FROM $1::jsonb
			                       OR ($7::timestamptz IS NOT NULL AND deletion_timestamp IS NULL)
			                      THEN generation + 1 ELSE generation END,
			    resource_version = nextval('resources_resource_version_seq'), updated_at = NOW()
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
	labelSel, err := parseLabelSelector(opts.LabelSelector)
	if err != nil {
		return nil, err
	}

	fieldPreds, err := parseFieldSelector(opts.FieldSelector)
	if err != nil {
		return nil, err
	}

	w := &postgresWatcher{
		outCh:      make(chan watch.Event, 100),
		inputCh:    make(chan *changeRow, 256),
		backend:    p,
		kind:       kind,
		ns:         namespace,
		labelSel:   labelSel,
		fieldPreds: fieldPreds,
		ctx:        ctx,
		done:       make(chan struct{}),
		seenRVs:    make(map[string]int64),
	}

	// The broadcaster is a shared per-kind singleton that outlives any single
	// Watch request; its relist deliberately uses the backend lifetime context
	// (cancelled on Close), not this request ctx — inheriting ctx would let one
	// watcher's disconnect break relists for every other watcher of the kind.
	b := p.getOrCreateBroadcasterAndSubscribe(kind, w) //nolint:contextcheck // broadcaster owns its lifetime via backend.ctx, not the request ctx
	w.bc = b

	go w.run()

	return w, nil
}

func (p *PostgreSQLBackend) getOrCreateBroadcasterAndSubscribe(kind string, w *postgresWatcher) *kindBroadcaster {
	p.mu.Lock()
	defer p.mu.Unlock()
	b := p.broadcasters[kind]
	if b == nil || b.isDone() {
		b = newKindBroadcaster(p, kind)
		p.broadcasters[kind] = b
		go b.run()
	}
	b.subscribe(w)
	return b
}

func (p *PostgreSQLBackend) currentMaxRV() int64 {
	rv, err := p.getMaxResourceVersion()
	if err != nil {
		return 0
	}
	return rv
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

// nudgeKind wakes the broadcaster for a single kind (one relist), if one exists.
// Namespace is irrelevant for selecting the broadcaster — broadcasters are keyed by
// kind and route to the right watchers by namespace at fan-out.
func (p *PostgreSQLBackend) nudgeKind(kind string) {
	p.mu.RLock()
	b := p.broadcasters[kind]
	p.mu.RUnlock()
	if b != nil {
		b.nudge()
	}
}

// nudgeWatchersByKindNamespace is kept as the WAL consumer's entry point; the
// namespace argument is now only informational since the broadcaster is per-kind.
func (p *PostgreSQLBackend) nudgeWatchersByKindNamespace(kind, namespace string) {
	_ = namespace
	p.nudgeKind(kind)
}

// nudgeAllWatchers relists every kind's broadcaster — called once on WAL reconnect
// so no committed change is missed across the gap.
func (p *PostgreSQLBackend) nudgeAllWatchers() {
	p.mu.RLock()
	defer p.mu.RUnlock()
	for _, b := range p.broadcasters {
		b.nudge()
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
	// outCh is the public watch stream. Its SOLE writer is run(); the broadcaster
	// never touches it, which keeps close() race-free.
	outCh chan watch.Event
	// inputCh carries fan-out rows from the kind's broadcaster. Written by the
	// broadcaster (non-blocking) and never closed; drained by run().
	inputCh    chan *changeRow
	backend    *PostgreSQLBackend
	bc         *kindBroadcaster
	kind       string
	ns         string
	labelSel   k8slabels.Selector
	fieldPreds []fieldPredicate
	ctx        context.Context
	done       chan struct{}
	stopped    atomic.Bool
	closed     sync.Once
	lastSeenRV atomic.Int64
	// behind is set by the broadcaster when this watcher's inputCh is full and a row
	// was dropped; run() then does a private catch-up relist to recover it.
	behind          atomic.Bool
	initialListDone bool
	// seenRVs maps a resource UID to the highest rv we've already emitted for it.
	// Combined with the lookback window in relist(), this lets us re-fetch rows that
	// might have been invisible during a prior relist (because their txn was still
	// in flight) without re-emitting events the consumer already saw. It also dedups
	// the initial relist against broadcaster fan-out.
	seenMu  sync.Mutex
	seenRVs map[string]int64
}

func (w *postgresWatcher) Stop() {
	if w.stopped.Swap(true) {
		return
	}
	if w.bc != nil {
		w.bc.unsubscribe(w)
	}
	w.closed.Do(func() {
		close(w.done)
	})
}

func (w *postgresWatcher) ResultChan() <-chan watch.Event {
	return w.outCh
}

func (w *postgresWatcher) run() {
	// Stop() (deferred first, runs first) unsubscribes from the broadcaster so no
	// further fan-out targets this watcher, THEN close(outCh) (runs last) is safe
	// because run() is the only writer to outCh.
	defer close(w.outCh)
	defer w.Stop()

	// Initial population: full current state via this watcher's filters. On
	// failure, arm `behind` so the bookmark tick retries — otherwise the watcher
	// would start permanently empty until the first fanned-out change.
	if err := w.relist(); err != nil {
		w.behind.Store(true)
	}
	w.sendBookmark()

	bookmarkTicker := time.NewTicker(30 * time.Second)
	defer bookmarkTicker.Stop()

	for {
		select {
		case <-w.done:
			return
		case <-w.ctx.Done():
			return
		case <-bookmarkTicker.C:
			// Also retry any catch-up that failed on a previous tick/row, so
			// recovery doesn't stall on a quiescent kind (no new inputCh rows).
			w.recoverIfBehind()
			w.sendBookmark()
		case row := <-w.inputCh:
			if !w.forwardRow(row) {
				return
			}
			// If the broadcaster dropped rows into a full inputCh, recover them
			// with a private filtered relist (runs in this goroutine, so it
			// respects outCh backpressure and never blocks other watchers).
			w.recoverIfBehind()
		}
	}
}

// recoverIfBehind drains a pending "behind" flag by running a private catch-up
// relist. `behind` is cleared first so a drop concurrent with the relist re-arms
// it; on relist error it is re-armed so the next row/tick retries. This is the
// only recovery path — the broadcaster's seenRVs suppress re-fanning a row it
// already dropped, so a dropped event is lost if this never succeeds.
func (w *postgresWatcher) recoverIfBehind() {
	if w.behind.Swap(false) {
		if err := w.relist(); err != nil {
			w.behind.Store(true)
		}
	}
}

// forwardRow emits one broadcaster fan-out row, deduped against this watcher's
// seenRVs and deep-copied so the broadcaster's shared object is never mutated.
// Returns false if the watcher is shutting down.
func (w *postgresWatcher) forwardRow(row *changeRow) bool {
	uidNew := !w.hasSeenUID(row.uid)
	if w.markSeen(row.uid, row.rv) {
		return true
	}
	var eventType watch.EventType
	switch {
	case row.deleted:
		eventType = watch.Deleted
	case uidNew:
		eventType = watch.Added
	default:
		eventType = watch.Modified
	}
	w.advanceRV(row.rv)
	select {
	case w.outCh <- watch.Event{Type: eventType, Object: row.obj.DeepCopyObject()}:
		return true
	case <-w.done:
		return false
	case <-w.ctx.Done():
		return false
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

// relist re-queries this watcher's slice and emits any rows it hasn't seen. It
// returns an error if the query itself failed, so callers recovering dropped
// events (run()) can tell a real failure from a clean pass and re-arm. A nil
// return where the loop stopped early because the watcher is shutting down is
// intentional: there is nothing left to recover.
func (w *postgresWatcher) relist() error {
	// FIX: BIGSERIAL resource_versions are assigned at INSERT statement time, but row
	// visibility depends on COMMIT time. Two concurrent INSERTs can commit in the
	// opposite order from rv assignment, so a strict `rv > lastSeenRV` cursor can skip
	// past an in-flight rv permanently. Mitigation: re-query with a lookback window,
	// then dedup by (uid, rv) using w.seenRVs to avoid double-emitting.
	query, args := w.buildRelistQuery()
	rows, err := w.backend.db.QueryContext(w.ctx, query, args...)
	if err != nil {
		watcherRelistFailures.WithLabelValues(w.kind).Inc()
		return err
	}
	defer func() { _ = rows.Close() }()

	for rows.Next() {
		var rv, generation int64
		var ns, name, uid string
		var spec, status, labels, annotations, finalizers, ownerRefs []byte
		var createdAt time.Time
		var deletedAt, deletionTimestamp sql.NullTime

		if err := rows.Scan(&rv, &generation, &ns, &name, &uid, &spec, &status, &labels, &annotations, &finalizers, &ownerRefs, &createdAt, &deletedAt, &deletionTimestamp); err != nil {
			// Partial read: do NOT advance/prune, so the next relist re-reads
			// the same window and nothing is permanently skipped.
			watcherRelistFailures.WithLabelValues(w.kind).Inc()
			return err
		}
		if !w.emitRow(rv, generation, ns, name, uid, spec, status, labels, annotations, finalizers, ownerRefs, createdAt, deletedAt, deletionTimestamp) {
			return nil // watcher shutting down, not a relist failure
		}
	}
	if err := rows.Err(); err != nil {
		watcherRelistFailures.WithLabelValues(w.kind).Inc()
		return err
	}
	w.pruneSeen()
	return nil
}
