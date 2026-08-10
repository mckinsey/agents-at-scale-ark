/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"fmt"
	"time"

	"github.com/jackc/pglogrepl"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgproto3"
	"k8s.io/klog/v2"
)

const (
	walSlotName          = "ark_cdc"
	walPublicationName   = "ark_cdc"
	walStandbyTimeout    = 10 * time.Second
	walKeepaliveInterval = 5 * time.Second
)

type walStreamState struct {
	relations        map[uint32]*pglogrepl.RelationMessage
	lastWriteLSN     pglogrepl.LSN
	lastStatusUpdate time.Time
}

func (p *PostgreSQLBackend) handleWALMessage(conn *pgconn.PgConn, rawMsg pgproto3.BackendMessage, state *walStreamState) error {
	if errMsg, ok := rawMsg.(*pgproto3.ErrorResponse); ok {
		return fmt.Errorf("postgres error: %s %s", errMsg.Code, errMsg.Message)
	}

	copyData, ok := rawMsg.(*pgproto3.CopyData)
	if !ok {
		return nil
	}

	switch copyData.Data[0] {
	case pglogrepl.PrimaryKeepaliveMessageByteID:
		msg, err := pglogrepl.ParsePrimaryKeepaliveMessage(copyData.Data[1:])
		if err != nil {
			klog.Errorf("WAL parse keepalive: %v", err)
			return nil
		}
		// Advance our position to the server's current WAL end. When the published
		// `resources` table is idle but the database keeps writing WAL (autovacuum,
		// checkpoints, other activity), the server streams keepalives rather than row
		// data. If we only ever acknowledged row-change positions, confirmed_flush_lsn
		// would freeze at the last change and the slot would pin every WAL segment
		// since — growing without bound until the volume fills. Confirming ServerWALEnd
		// is what lets Postgres recycle WAL on a quiet cluster. It is safe: the server
		// holds restart_lsn back for any still-running transaction regardless of what
		// we confirm, and this consumer relists watchers on reconnect rather than
		// replaying missed WAL, so it never needs WAL below the current position.
		advanceLSN(state, msg.ServerWALEnd)
		if msg.ReplyRequested {
			if err := p.sendStandbyStatus(conn, state.lastWriteLSN); err != nil {
				return fmt.Errorf("standby status reply: %w", err)
			}
			state.lastStatusUpdate = time.Now()
		}

	case pglogrepl.XLogDataByteID:
		xld, err := pglogrepl.ParseXLogData(copyData.Data[1:])
		if err != nil {
			klog.Errorf("WAL parse xlog: %v", err)
			return nil
		}

		p.processWALData(xld.WALData, state.relations)
		// Track the furthest server position we've observed — the end of this data
		// chunk and the server's reported WAL end — so status updates keep advancing
		// across stretches of WAL that decode to nothing for our publication.
		advanceLSN(state, xld.WALStart+pglogrepl.LSN(len(xld.WALData)))
		advanceLSN(state, xld.ServerWALEnd)
	}

	return nil
}

// advanceLSN moves the consumer's acknowledged position forward, never backward.
// lastWriteLSN is reported to the server as the write/flush/apply position in
// standby status updates, which is what drives confirmed_flush_lsn and lets the
// server recycle WAL.
func advanceLSN(state *walStreamState, lsn pglogrepl.LSN) {
	if lsn > state.lastWriteLSN {
		state.lastWriteLSN = lsn
	}
}

func (p *PostgreSQLBackend) processWALData(data []byte, relations map[uint32]*pglogrepl.RelationMessage) {
	msg, err := pglogrepl.Parse(data)
	if err != nil {
		klog.Errorf("WAL parse message (len=%d, first byte=%d): %v", len(data), data[0], err)
		return
	}

	switch m := msg.(type) {
	case *pglogrepl.RelationMessage:
		relations[m.RelationID] = m

	case *pglogrepl.InsertMessage:
		p.nudgeFromTuple(relations, m.RelationID, m.Tuple)

	case *pglogrepl.UpdateMessage:
		p.nudgeFromTuple(relations, m.RelationID, m.NewTuple)

	case *pglogrepl.DeleteMessage:
		// Ignored: Ark uses soft-delete (UPDATE SET deleted_at).
		// Actual DELETEs are background cleanup of already-deleted records.
	}
}

func (p *PostgreSQLBackend) nudgeFromTuple(relations map[uint32]*pglogrepl.RelationMessage, relationID uint32, tuple *pglogrepl.TupleData) {
	if tuple == nil {
		return
	}
	rel, ok := relations[relationID]
	if !ok {
		return
	}

	var kind, namespace string
	for i, col := range rel.Columns {
		if i >= int(tuple.ColumnNum) {
			break
		}
		if tuple.Columns[i].DataType != pglogrepl.TupleDataTypeText {
			continue
		}
		switch col.Name {
		case "kind":
			kind = string(tuple.Columns[i].Data)
		case "namespace":
			namespace = string(tuple.Columns[i].Data)
		}
		if kind != "" && namespace != "" {
			break
		}
	}

	if kind != "" {
		p.nudgeWatchersByKindNamespace(kind, namespace)
	}
}
