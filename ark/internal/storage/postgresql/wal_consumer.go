/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/jackc/pglogrepl"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgproto3"
	"k8s.io/klog/v2"
)

const (
	walSlotPrefix        = "ark_cdc_"
	walPublicationName   = "ark_cdc"
	walStandbyTimeout    = 10 * time.Second
	walKeepaliveInterval = 5 * time.Second
)

type walStreamState struct {
	relations        map[uint32]*pglogrepl.RelationMessage
	lastWriteLSN     pglogrepl.LSN
	lastStatusUpdate time.Time
}

func generateSlotName() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return walSlotPrefix + hex.EncodeToString(b)
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
		state.lastWriteLSN = xld.WALStart + pglogrepl.LSN(len(xld.WALData))
	}

	return nil
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
