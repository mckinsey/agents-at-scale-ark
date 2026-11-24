/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"database/sql"
	"time"
)

const changeRowColumns = `resource_version, generation, namespace, name, uid, spec, status, labels, annotations, finalizers, owner_references, created_at, deleted_at, deletion_timestamp`

type changeRowData struct {
	rv, generation                                           int64
	ns, name, uid                                            string
	spec, status, labels, annotations, finalizers, ownerRefs []byte
	createdAt                                                time.Time
	deletedAt, deletionTimestamp                             sql.NullTime
}

func scanChangeRow(rows *sql.Rows) (changeRowData, error) {
	var r changeRowData
	err := rows.Scan(&r.rv, &r.generation, &r.ns, &r.name, &r.uid, &r.spec, &r.status, &r.labels, &r.annotations, &r.finalizers, &r.ownerRefs, &r.createdAt, &r.deletedAt, &r.deletionTimestamp)
	return r, err
}
