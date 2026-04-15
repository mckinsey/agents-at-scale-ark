/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pglogrepl"
	"github.com/jackc/pgx/v5/pgproto3"
)

func newTestBackendWithWatchers(watchers map[string][]*postgresWatcher) *PostgreSQLBackend {
	ctx, cancel := context.WithCancel(context.Background())
	return &PostgreSQLBackend{
		watchers: watchers,
		ctx:      ctx,
		cancel:   cancel,
	}
}

func newTestWatcher() *postgresWatcher {
	return &postgresWatcher{
		nudgeCh: make(chan struct{}, 1),
	}
}

func makeRelation(id uint32, columns ...string) *pglogrepl.RelationMessage {
	cols := make([]*pglogrepl.RelationMessageColumn, len(columns))
	for i, name := range columns {
		cols[i] = &pglogrepl.RelationMessageColumn{Name: name}
	}
	return &pglogrepl.RelationMessage{
		RelationID: id,
		ColumnNum:  uint16(len(columns)),
		Columns:    cols,
	}
}

func makeTuple(values ...string) *pglogrepl.TupleData {
	cols := make([]*pglogrepl.TupleDataColumn, len(values))
	for i, v := range values {
		cols[i] = &pglogrepl.TupleDataColumn{
			DataType: pglogrepl.TupleDataTypeText,
			Length:   uint32(len(v)),
			Data:     []byte(v),
		}
	}
	return &pglogrepl.TupleData{
		ColumnNum: uint16(len(values)),
		Columns:   cols,
	}
}

func TestGenerateSlotName(t *testing.T) {
	name := generateSlotName()
	if !strings.HasPrefix(name, walSlotPrefix) {
		t.Errorf("slot name %q missing prefix %q", name, walSlotPrefix)
	}
	if len(name) != len(walSlotPrefix)+8 {
		t.Errorf("slot name %q has unexpected length %d", name, len(name))
	}

	names := make(map[string]bool)
	for i := 0; i < 100; i++ {
		n := generateSlotName()
		if names[n] {
			t.Fatalf("duplicate slot name after %d iterations: %s", i, n)
		}
		names[n] = true
	}
}

func TestNudgeAllWatchers(t *testing.T) {
	w1 := newTestWatcher()
	w2 := newTestWatcher()
	w3 := newTestWatcher()
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{
		"Agent/default":     {w1},
		"Model/production":  {w2},
		"MCPServer/default": {w3},
	})

	backend.nudgeAllWatchers()

	for _, w := range []*postgresWatcher{w1, w2, w3} {
		select {
		case <-w.nudgeCh:
		default:
			t.Error("watcher was not nudged")
		}
	}
}

func TestNudgeAllWatchersEmpty(t *testing.T) {
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{})
	backend.nudgeAllWatchers()
}

func TestNudgeAllWatchersFullChannel(t *testing.T) {
	w := newTestWatcher()
	w.nudgeCh <- struct{}{}
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{
		"Agent/default": {w},
	})

	backend.nudgeAllWatchers()

	select {
	case <-w.nudgeCh:
	default:
		t.Error("channel should still have one message")
	}
}

func TestNudgeWatchersByKindNamespace(t *testing.T) {
	exact := newTestWatcher()
	allNs := newTestWatcher()
	other := newTestWatcher()

	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{
		"Agent/production": {exact},
		"Agent/":           {allNs},
		"Model/production": {other},
	})

	backend.nudgeWatchersByKindNamespace("Agent", "production")

	select {
	case <-exact.nudgeCh:
	default:
		t.Error("exact match watcher not nudged")
	}
	select {
	case <-allNs.nudgeCh:
	default:
		t.Error("all-namespace watcher not nudged")
	}
	select {
	case <-other.nudgeCh:
		t.Error("unrelated watcher should not be nudged")
	default:
	}
}

func TestNudgeWatchersByKindEmptyNamespace(t *testing.T) {
	allNs := newTestWatcher()
	specific := newTestWatcher()
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{
		"Agent/":           {allNs},
		"Agent/production": {specific},
	})

	backend.nudgeWatchersByKindNamespace("Agent", "")

	select {
	case <-allNs.nudgeCh:
	default:
		t.Error("all-namespace watcher should be nudged via exact key match on empty namespace")
	}
	select {
	case <-specific.nudgeCh:
		t.Error("namespace-specific watcher should not be nudged for empty namespace")
	default:
	}
}

func TestNudgeFromTuple(t *testing.T) {
	w := newTestWatcher()
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{
		"Agent/production": {w},
	})

	relations := map[uint32]*pglogrepl.RelationMessage{
		1: makeRelation(1, "id", "kind", "namespace", "name"),
	}
	tuple := makeTuple("123", "Agent", "production", "my-agent")

	backend.nudgeFromTuple(relations, 1, tuple)

	select {
	case <-w.nudgeCh:
	default:
		t.Error("watcher not nudged after INSERT")
	}
}

func TestNudgeFromTupleNilTuple(t *testing.T) {
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{})
	relations := map[uint32]*pglogrepl.RelationMessage{
		1: makeRelation(1, "kind", "namespace"),
	}
	backend.nudgeFromTuple(relations, 1, nil)
}

func TestNudgeFromTupleUnknownRelation(t *testing.T) {
	w := newTestWatcher()
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{
		"Agent/default": {w},
	})
	relations := map[uint32]*pglogrepl.RelationMessage{}
	tuple := makeTuple("Agent", "default")

	backend.nudgeFromTuple(relations, 999, tuple)

	select {
	case <-w.nudgeCh:
		t.Error("should not nudge with unknown relation")
	default:
	}
}

func TestNudgeFromTupleNoKindColumn(t *testing.T) {
	w := newTestWatcher()
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{
		"Agent/default": {w},
	})

	relations := map[uint32]*pglogrepl.RelationMessage{
		1: makeRelation(1, "id", "namespace", "name"),
	}
	tuple := makeTuple("123", "default", "my-agent")

	backend.nudgeFromTuple(relations, 1, tuple)

	select {
	case <-w.nudgeCh:
		t.Error("should not nudge without kind column")
	default:
	}
}

func TestNudgeFromTupleNullDataType(t *testing.T) {
	w := newTestWatcher()
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{
		"Agent/default": {w},
	})

	relations := map[uint32]*pglogrepl.RelationMessage{
		1: makeRelation(1, "kind", "namespace"),
	}
	tuple := &pglogrepl.TupleData{
		ColumnNum: 2,
		Columns: []*pglogrepl.TupleDataColumn{
			{DataType: pglogrepl.TupleDataTypeNull},
			{DataType: pglogrepl.TupleDataTypeText, Data: []byte("default")},
		},
	}

	backend.nudgeFromTuple(relations, 1, tuple)

	select {
	case <-w.nudgeCh:
		t.Error("should not nudge when kind is NULL")
	default:
	}
}

func TestProcessWALDataRelationMessage(t *testing.T) {
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{})
	relations := make(map[uint32]*pglogrepl.RelationMessage)

	rel := &pglogrepl.RelationMessage{
		RelationID:   42,
		Namespace:    "public",
		RelationName: "resources",
		ColumnNum:    2,
		Columns: []*pglogrepl.RelationMessageColumn{
			{Name: "kind"},
			{Name: "namespace"},
		},
	}
	data := encodeRelationMessage(rel)

	backend.processWALData(data, relations)

	if _, ok := relations[42]; !ok {
		t.Error("relation not stored")
	}
}

func TestProcessWALDataInsertMessage(t *testing.T) {
	w := newTestWatcher()
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{
		"Agent/default": {w},
	})

	relations := map[uint32]*pglogrepl.RelationMessage{
		1: makeRelation(1, "kind", "namespace", "name"),
	}

	insert := encodeInsertMessage(1, makeTuple("Agent", "default", "my-agent"))

	backend.processWALData(insert, relations)

	select {
	case <-w.nudgeCh:
	default:
		t.Error("watcher not nudged on INSERT")
	}
}

func TestProcessWALDataUpdateMessage(t *testing.T) {
	w := newTestWatcher()
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{
		"Model/prod": {w},
	})

	relations := map[uint32]*pglogrepl.RelationMessage{
		2: makeRelation(2, "kind", "namespace"),
	}

	update := encodeUpdateMessage(2, makeTuple("Model", "prod"))

	backend.processWALData(update, relations)

	select {
	case <-w.nudgeCh:
	default:
		t.Error("watcher not nudged on UPDATE")
	}
}

func TestProcessWALDataDeleteMessage(t *testing.T) {
	w := newTestWatcher()
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{
		"Agent/default": {w},
	})

	relations := map[uint32]*pglogrepl.RelationMessage{
		3: makeRelation(3, "kind", "namespace"),
	}

	del := encodeDeleteMessage(3)
	backend.processWALData(del, relations)

	select {
	case <-w.nudgeCh:
		t.Error("DELETE should not nudge watchers")
	default:
	}
}

func TestProcessWALDataInvalidBytes(t *testing.T) {
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{})
	relations := make(map[uint32]*pglogrepl.RelationMessage)
	backend.processWALData([]byte{0xff, 0x00}, relations)
}

func TestHandleWALMessageErrorResponse(t *testing.T) {
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{})
	state := &walStreamState{relations: make(map[uint32]*pglogrepl.RelationMessage)}

	errMsg := &pgproto3.ErrorResponse{Code: "XX000", Message: "test error"}
	err := backend.handleWALMessage(nil, errMsg, state)

	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "XX000") || !strings.Contains(err.Error(), "test error") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestHandleWALMessageNonCopyData(t *testing.T) {
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{})
	state := &walStreamState{relations: make(map[uint32]*pglogrepl.RelationMessage)}

	err := backend.handleWALMessage(nil, &pgproto3.NoticeResponse{}, state)
	if err != nil {
		t.Errorf("non-CopyData should return nil: %v", err)
	}
}

func TestHandleWALMessageKeepaliveNoReply(t *testing.T) {
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{})
	state := &walStreamState{relations: make(map[uint32]*pglogrepl.RelationMessage)}

	keepalive := encodePrimaryKeepalive(0, false)
	msg := &pgproto3.CopyData{Data: keepalive}

	err := backend.handleWALMessage(nil, msg, state)
	if err != nil {
		t.Errorf("keepalive without reply should not error: %v", err)
	}
}

func TestHandleWALMessageXLogDataInsert(t *testing.T) {
	w := newTestWatcher()
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{
		"Agent/default": {w},
	})

	state := &walStreamState{
		relations: map[uint32]*pglogrepl.RelationMessage{
			1: makeRelation(1, "kind", "namespace", "name"),
		},
	}

	walData := encodeInsertMessage(1, makeTuple("Agent", "default", "test"))
	xlogData := encodeXLogData(100, walData)
	msg := &pgproto3.CopyData{Data: xlogData}

	err := backend.handleWALMessage(nil, msg, state)
	if err != nil {
		t.Errorf("xlog insert should not error: %v", err)
	}

	select {
	case <-w.nudgeCh:
	default:
		t.Error("watcher not nudged via XLogData INSERT")
	}

	if state.lastWriteLSN == 0 {
		t.Error("lastWriteLSN not advanced")
	}
}

func TestHandleWALMessageXLogDataRelation(t *testing.T) {
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{})
	state := &walStreamState{
		relations: make(map[uint32]*pglogrepl.RelationMessage),
	}

	rel := &pglogrepl.RelationMessage{
		RelationID:   99,
		Namespace:    "public",
		RelationName: "resources",
		ColumnNum:    2,
		Columns: []*pglogrepl.RelationMessageColumn{
			{Name: "kind"},
			{Name: "namespace"},
		},
	}
	walData := encodeRelationMessage(rel)
	xlogData := encodeXLogData(200, walData)
	msg := &pgproto3.CopyData{Data: xlogData}

	err := backend.handleWALMessage(nil, msg, state)
	if err != nil {
		t.Errorf("xlog relation should not error: %v", err)
	}

	if _, ok := state.relations[99]; !ok {
		t.Error("relation not stored via XLogData")
	}
}

func TestHandleWALMessageInvalidKeepalive(t *testing.T) {
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{})
	state := &walStreamState{relations: make(map[uint32]*pglogrepl.RelationMessage)}

	msg := &pgproto3.CopyData{Data: []byte{pglogrepl.PrimaryKeepaliveMessageByteID, 0x01}}
	err := backend.handleWALMessage(nil, msg, state)
	if err != nil {
		t.Errorf("invalid keepalive should log and return nil: %v", err)
	}
}

func TestHandleWALMessageInvalidXLogData(t *testing.T) {
	backend := newTestBackendWithWatchers(map[string][]*postgresWatcher{})
	state := &walStreamState{relations: make(map[uint32]*pglogrepl.RelationMessage)}

	msg := &pgproto3.CopyData{Data: []byte{pglogrepl.XLogDataByteID, 0x01}}
	err := backend.handleWALMessage(nil, msg, state)
	if err != nil {
		t.Errorf("invalid xlog should log and return nil: %v", err)
	}
}

func TestNudgeWatchersConcurrent(t *testing.T) {
	watchers := make(map[string][]*postgresWatcher)
	for i := 0; i < 10; i++ {
		key := "Agent/" + string(rune('a'+i))
		watchers[key] = []*postgresWatcher{newTestWatcher()}
	}
	backend := newTestBackendWithWatchers(watchers)

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			backend.nudgeAllWatchers()
		}()
	}
	wg.Wait()
}

func encodeRelationMessage(rel *pglogrepl.RelationMessage) []byte {
	buf := []byte{byte(pglogrepl.MessageTypeRelation)}
	buf = appendUint32(buf, rel.RelationID)
	buf = appendString(buf, rel.Namespace)
	buf = appendString(buf, rel.RelationName)
	buf = append(buf, rel.ReplicaIdentity)
	buf = appendUint16(buf, rel.ColumnNum)
	for _, col := range rel.Columns {
		buf = append(buf, col.Flags)
		buf = appendString(buf, col.Name)
		buf = appendUint32(buf, col.DataType)
		buf = appendInt32(buf, col.TypeModifier)
	}
	return buf
}

func encodeInsertMessage(relationID uint32, tuple *pglogrepl.TupleData) []byte {
	buf := []byte{byte(pglogrepl.MessageTypeInsert)}
	buf = appendUint32(buf, relationID)
	buf = append(buf, 'N')
	buf = encodeTupleData(buf, tuple)
	return buf
}

func encodeUpdateMessage(relationID uint32, newTuple *pglogrepl.TupleData) []byte {
	buf := []byte{byte(pglogrepl.MessageTypeUpdate)}
	buf = appendUint32(buf, relationID)
	buf = append(buf, 'N')
	buf = encodeTupleData(buf, newTuple)
	return buf
}

func encodeDeleteMessage(relationID uint32) []byte {
	buf := []byte{byte(pglogrepl.MessageTypeDelete)}
	buf = appendUint32(buf, relationID)
	buf = append(buf, 'O')
	buf = appendUint16(buf, 0)
	return buf
}

func encodeTupleData(buf []byte, tuple *pglogrepl.TupleData) []byte {
	buf = appendUint16(buf, tuple.ColumnNum)
	for _, col := range tuple.Columns {
		buf = append(buf, col.DataType)
		if col.DataType == pglogrepl.TupleDataTypeText || col.DataType == pglogrepl.TupleDataTypeBinary {
			buf = appendUint32(buf, uint32(len(col.Data)))
			buf = append(buf, col.Data...)
		}
	}
	return buf
}

func appendUint16(buf []byte, v uint16) []byte {
	return append(buf, byte(v>>8), byte(v))
}

func appendUint32(buf []byte, v uint32) []byte {
	return append(buf, byte(v>>24), byte(v>>16), byte(v>>8), byte(v))
}

func appendInt32(buf []byte, v int32) []byte {
	return appendUint32(buf, uint32(v))
}

func appendString(buf []byte, s string) []byte {
	return append(append(buf, s...), 0)
}

func appendUint64(buf []byte, v uint64) []byte {
	return append(buf,
		byte(v>>56), byte(v>>48), byte(v>>40), byte(v>>32),
		byte(v>>24), byte(v>>16), byte(v>>8), byte(v))
}

func encodePrimaryKeepalive(serverWALEnd uint64, replyRequested bool) []byte {
	buf := []byte{pglogrepl.PrimaryKeepaliveMessageByteID}
	buf = appendUint64(buf, serverWALEnd)
	buf = appendUint64(buf, 0)
	if replyRequested {
		buf = append(buf, 1)
	} else {
		buf = append(buf, 0)
	}
	return buf
}

func encodeXLogData(walStart uint64, walData []byte) []byte {
	buf := []byte{pglogrepl.XLogDataByteID}
	buf = appendUint64(buf, walStart)
	buf = appendUint64(buf, 0)
	buf = appendUint64(buf, 0)
	buf = append(buf, walData...)
	return buf
}
