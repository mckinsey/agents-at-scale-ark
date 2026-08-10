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

// newTestBackendWithBroadcasters builds a backend pre-populated with one
// (un-started) broadcaster per kind. The broadcasters expose nudgeCh so tests can
// assert WAL-driven nudging without a database or running run() loop — mirroring
// how the real WAL consumer wakes a per-kind broadcaster.
func newTestBackendWithBroadcasters(kinds ...string) (*PostgreSQLBackend, map[string]*kindBroadcaster) {
	ctx, cancel := context.WithCancel(context.Background())
	b := &PostgreSQLBackend{
		broadcasters: make(map[string]*kindBroadcaster),
		ctx:          ctx,
		cancel:       cancel,
	}
	m := make(map[string]*kindBroadcaster, len(kinds))
	for _, k := range kinds {
		bc := newKindBroadcaster(b, k)
		b.broadcasters[k] = bc
		m[k] = bc
	}
	return b, m
}

func nudged(bc *kindBroadcaster) bool {
	select {
	case <-bc.nudgeCh:
		return true
	default:
		return false
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

func TestPostgresWatcher_FirstSeenUID(t *testing.T) {
	t.Parallel()
	w := &postgresWatcher{seenRVs: make(map[string]int64)}

	if w.hasSeenUID("uid-A") {
		t.Error("hasSeenUID should return false for unseen UID")
	}
	if w.markSeen("uid-A", 100) {
		t.Error("markSeen should return false (not skip) for new uid/rv")
	}
	if !w.hasSeenUID("uid-A") {
		t.Error("hasSeenUID should return true after markSeen recorded the uid")
	}
	if w.hasSeenUID("uid-B") {
		t.Error("hasSeenUID should return false for a different unseen UID")
	}
	if !w.markSeen("uid-A", 100) {
		t.Error("markSeen should return true (skip) for already-emitted (uid, rv)")
	}
	if w.markSeen("uid-A", 101) {
		t.Error("markSeen should return false (not skip) for higher rv on same uid")
	}
}

func TestSlotNameIsStable(t *testing.T) {
	if walSlotName != "ark_cdc" {
		t.Errorf("slot name changed unexpectedly: got %q want %q (stability matters: existing deployments rely on this name to resume their WAL position across restarts)", walSlotName, "ark_cdc")
	}
}

func TestNudgeAllWatchers(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent", "Model", "MCPServer")

	backend.nudgeAllWatchers()

	for kind, bc := range bcs {
		if !nudged(bc) {
			t.Errorf("broadcaster %q was not nudged", kind)
		}
	}
}

func TestNudgeAllWatchersEmpty(t *testing.T) {
	backend, _ := newTestBackendWithBroadcasters()
	backend.nudgeAllWatchers()
}

func TestNudgeAllWatchersFullChannel(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent")
	bc := bcs["Agent"]
	bc.nudge() // pre-fill the coalescing buffer

	backend.nudgeAllWatchers()

	if !nudged(bc) {
		t.Error("channel should still have one message")
	}
}

func TestNudgeWatchersByKindNamespace(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent", "Model")

	backend.nudgeWatchersByKindNamespace("Agent", "production")

	if !nudged(bcs["Agent"]) {
		t.Error("Agent broadcaster not nudged")
	}
	if nudged(bcs["Model"]) {
		t.Error("unrelated kind should not be nudged")
	}
}

func TestNudgeWatchersByKindEmptyNamespace(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent", "Model")

	backend.nudgeWatchersByKindNamespace("Agent", "")

	if !nudged(bcs["Agent"]) {
		t.Error("Agent broadcaster should be nudged for empty namespace")
	}
	if nudged(bcs["Model"]) {
		t.Error("unrelated kind should not be nudged")
	}
}

func TestNudgeWatchersByKindNamespaceUnknownKind(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent")

	// No broadcaster for "Model"; must be a no-op (not panic).
	backend.nudgeWatchersByKindNamespace("Model", "production")

	if nudged(bcs["Agent"]) {
		t.Error("Agent broadcaster should not be nudged for a different kind")
	}
}

func TestNudgeFromTuple(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent")

	relations := map[uint32]*pglogrepl.RelationMessage{
		1: makeRelation(1, "id", "kind", "namespace", "name"),
	}
	tuple := makeTuple("123", "Agent", "production", "my-agent")

	backend.nudgeFromTuple(relations, 1, tuple)

	if !nudged(bcs["Agent"]) {
		t.Error("broadcaster not nudged after INSERT")
	}
}

func TestNudgeFromTupleNilTuple(t *testing.T) {
	backend, _ := newTestBackendWithBroadcasters()
	relations := map[uint32]*pglogrepl.RelationMessage{
		1: makeRelation(1, "kind", "namespace"),
	}
	backend.nudgeFromTuple(relations, 1, nil)
}

func TestNudgeFromTupleUnknownRelation(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent")
	relations := map[uint32]*pglogrepl.RelationMessage{}
	tuple := makeTuple("Agent", "default")

	backend.nudgeFromTuple(relations, 999, tuple)

	if nudged(bcs["Agent"]) {
		t.Error("should not nudge with unknown relation")
	}
}

func TestNudgeFromTupleNoKindColumn(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent")

	relations := map[uint32]*pglogrepl.RelationMessage{
		1: makeRelation(1, "id", "namespace", "name"),
	}
	tuple := makeTuple("123", "default", "my-agent")

	backend.nudgeFromTuple(relations, 1, tuple)

	if nudged(bcs["Agent"]) {
		t.Error("should not nudge without kind column")
	}
}

func TestNudgeFromTupleNullDataType(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent")

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

	if nudged(bcs["Agent"]) {
		t.Error("should not nudge when kind is NULL")
	}
}

func TestProcessWALDataRelationMessage(t *testing.T) {
	backend, _ := newTestBackendWithBroadcasters()
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
	backend, bcs := newTestBackendWithBroadcasters("Agent")

	relations := map[uint32]*pglogrepl.RelationMessage{
		1: makeRelation(1, "kind", "namespace", "name"),
	}

	insert := encodeInsertMessage(1, makeTuple("Agent", "default", "my-agent"))

	backend.processWALData(insert, relations)

	if !nudged(bcs["Agent"]) {
		t.Error("broadcaster not nudged on INSERT")
	}
}

func TestProcessWALDataUpdateMessage(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Model")

	relations := map[uint32]*pglogrepl.RelationMessage{
		2: makeRelation(2, "kind", "namespace"),
	}

	update := encodeUpdateMessage(2, makeTuple("Model", "prod"))

	backend.processWALData(update, relations)

	if !nudged(bcs["Model"]) {
		t.Error("broadcaster not nudged on UPDATE")
	}
}

func TestProcessWALDataDeleteMessage(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent")

	relations := map[uint32]*pglogrepl.RelationMessage{
		3: makeRelation(3, "kind", "namespace"),
	}

	del := encodeDeleteMessage(3)
	backend.processWALData(del, relations)

	if nudged(bcs["Agent"]) {
		t.Error("DELETE should not nudge broadcasters")
	}
}

func TestProcessWALDataInvalidBytes(t *testing.T) {
	backend, _ := newTestBackendWithBroadcasters()
	relations := make(map[uint32]*pglogrepl.RelationMessage)
	backend.processWALData([]byte{0xff, 0x00}, relations)
}

func TestHandleWALMessageErrorResponse(t *testing.T) {
	backend, _ := newTestBackendWithBroadcasters()
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
	backend, _ := newTestBackendWithBroadcasters()
	state := &walStreamState{relations: make(map[uint32]*pglogrepl.RelationMessage)}

	err := backend.handleWALMessage(nil, &pgproto3.NoticeResponse{}, state)
	if err != nil {
		t.Errorf("non-CopyData should return nil: %v", err)
	}
}

func TestHandleWALMessageKeepaliveNoReply(t *testing.T) {
	backend, _ := newTestBackendWithBroadcasters()
	state := &walStreamState{relations: make(map[uint32]*pglogrepl.RelationMessage)}

	keepalive := encodePrimaryKeepalive(0, false)
	msg := &pgproto3.CopyData{Data: keepalive}

	err := backend.handleWALMessage(nil, msg, state)
	if err != nil {
		t.Errorf("keepalive without reply should not error: %v", err)
	}
}

func TestHandleWALMessageXLogDataInsert(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent")

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

	if !nudged(bcs["Agent"]) {
		t.Error("broadcaster not nudged via XLogData INSERT")
	}

	if state.lastWriteLSN == 0 {
		t.Error("lastWriteLSN not advanced")
	}
}

func TestHandleWALMessageXLogDataRelation(t *testing.T) {
	backend, _ := newTestBackendWithBroadcasters()
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
	backend, _ := newTestBackendWithBroadcasters()
	state := &walStreamState{relations: make(map[uint32]*pglogrepl.RelationMessage)}

	msg := &pgproto3.CopyData{Data: []byte{pglogrepl.PrimaryKeepaliveMessageByteID, 0x01}}
	err := backend.handleWALMessage(nil, msg, state)
	if err != nil {
		t.Errorf("invalid keepalive should log and return nil: %v", err)
	}
}

func TestHandleWALMessageInvalidXLogData(t *testing.T) {
	backend, _ := newTestBackendWithBroadcasters()
	state := &walStreamState{relations: make(map[uint32]*pglogrepl.RelationMessage)}

	msg := &pgproto3.CopyData{Data: []byte{pglogrepl.XLogDataByteID, 0x01}}
	err := backend.handleWALMessage(nil, msg, state)
	if err != nil {
		t.Errorf("invalid xlog should log and return nil: %v", err)
	}
}

func TestNudgeWatchersConcurrent(t *testing.T) {
	kinds := make([]string, 0, 10)
	for i := 0; i < 10; i++ {
		kinds = append(kinds, "Agent"+string(rune('a'+i)))
	}
	backend, _ := newTestBackendWithBroadcasters(kinds...)

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

// TestWriteNudgesOneBroadcasterPerKind is the amplification regression guard: a
// single write of a kind must wake exactly ONE broadcaster, regardless of how many
// watchers are subscribed — proving the per-watcher relist fan-out is gone (one
// relist per kind, not one per watcher).
func TestWriteNudgesOneBroadcasterPerKind(t *testing.T) {
	backend, bcs := newTestBackendWithBroadcasters("Agent")
	bc := bcs["Agent"]

	// 50 subscribers on the one broadcaster.
	for i := 0; i < 50; i++ {
		bc.subscribers[&postgresWatcher{}] = struct{}{}
	}

	relations := map[uint32]*pglogrepl.RelationMessage{
		1: makeRelation(1, "kind", "namespace", "name"),
	}
	backend.processWALData(encodeInsertMessage(1, makeTuple("Agent", "default", "a")), relations)

	if !nudged(bc) {
		t.Fatal("broadcaster not nudged on write")
	}
	// Coalesced: exactly one pending relist, not one-per-subscriber.
	if nudged(bc) {
		t.Fatal("expected a single coalesced nudge, found more than one")
	}
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
