/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"encoding/binary"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pglogrepl"
	"k8s.io/apimachinery/pkg/watch"
)

func TestGenerateSlotName(t *testing.T) {
	name := generateSlotName()
	if !strings.HasPrefix(name, walSlotPrefix) {
		t.Errorf("slot name %q missing prefix %q", name, walSlotPrefix)
	}
	suffix := strings.TrimPrefix(name, walSlotPrefix)
	if len(suffix) != 8 {
		t.Errorf("slot name suffix %q should be 8 hex chars, got %d", suffix, len(suffix))
	}

	seen := make(map[string]bool)
	for range 100 {
		n := generateSlotName()
		if seen[n] {
			t.Fatalf("duplicate slot name: %s", n)
		}
		seen[n] = true
	}
}

func encodeRelationMessage(relID uint32, namespace, relationName string, columns []string) []byte {
	var buf []byte
	buf = append(buf, byte(pglogrepl.MessageTypeRelation))
	buf = binary.BigEndian.AppendUint32(buf, relID)
	buf = append(buf, []byte(namespace)...)
	buf = append(buf, 0)
	buf = append(buf, []byte(relationName)...)
	buf = append(buf, 0)
	buf = append(buf, 0) // ReplicaIdentity
	buf = binary.BigEndian.AppendUint16(buf, uint16(len(columns)))
	for _, col := range columns {
		buf = append(buf, 0) // flags
		buf = append(buf, []byte(col)...)
		buf = append(buf, 0)
		buf = binary.BigEndian.AppendUint32(buf, 25) // DataType (text OID)
		buf = binary.BigEndian.AppendUint32(buf, 0)  // TypeModifier (as uint32, read as int32)
	}
	return buf
}

func encodeInsertMessage(relID uint32, values []string) []byte {
	var buf []byte
	buf = append(buf, byte(pglogrepl.MessageTypeInsert))
	buf = binary.BigEndian.AppendUint32(buf, relID)
	buf = append(buf, 'N')
	buf = binary.BigEndian.AppendUint16(buf, uint16(len(values)))
	for _, v := range values {
		buf = append(buf, pglogrepl.TupleDataTypeText)
		buf = binary.BigEndian.AppendUint32(buf, uint32(len(v)))
		buf = append(buf, []byte(v)...)
	}
	return buf
}

func encodeDeleteMessage(relID uint32, values []string) []byte {
	var buf []byte
	buf = append(buf, byte(pglogrepl.MessageTypeDelete))
	buf = binary.BigEndian.AppendUint32(buf, relID)
	buf = append(buf, 'K')
	buf = binary.BigEndian.AppendUint16(buf, uint16(len(values)))
	for _, v := range values {
		buf = append(buf, pglogrepl.TupleDataTypeText)
		buf = binary.BigEndian.AppendUint32(buf, uint32(len(v)))
		buf = append(buf, []byte(v)...)
	}
	return buf
}

func newTestBackendForWAL(t *testing.T) *PostgreSQLBackend {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	return &PostgreSQLBackend{
		watchers: make(map[string][]*postgresWatcher),
		ctx:      ctx,
		cancel:   cancel,
	}
}

func TestProcessWALData_RelationMessage(t *testing.T) {
	backend := newTestBackendForWAL(t)
	relations := make(map[uint32]*pglogrepl.RelationMessage)

	data := encodeRelationMessage(42, "public", "resources", []string{"kind", "namespace", "name"})
	backend.processWALData(data, relations)

	rel, ok := relations[42]
	if !ok {
		t.Fatal("relation 42 not stored in map")
	}
	if rel.RelationName != "resources" {
		t.Errorf("expected RelationName=resources, got %s", rel.RelationName)
	}
	if int(rel.ColumnNum) != 3 {
		t.Errorf("expected 3 columns, got %d", rel.ColumnNum)
	}
	if rel.Columns[0].Name != "kind" {
		t.Errorf("expected first column=kind, got %s", rel.Columns[0].Name)
	}
}

func TestProcessWALData_InsertMessage(t *testing.T) {
	backend := newTestBackendForWAL(t)

	nudgeCh := make(chan struct{}, 1)
	w := &postgresWatcher{
		outCh:   make(chan watch.Event, 100),
		nudgeCh: nudgeCh,
		done:    make(chan struct{}),
		ctx:     backend.ctx,
	}
	backend.mu.Lock()
	backend.watchers["Agent/default"] = append(backend.watchers["Agent/default"], w)
	backend.mu.Unlock()

	relations := make(map[uint32]*pglogrepl.RelationMessage)
	relData := encodeRelationMessage(1, "public", "resources", []string{"kind", "namespace", "name"})
	backend.processWALData(relData, relations)

	insertData := encodeInsertMessage(1, []string{"Agent", "default", "my-agent"})
	backend.processWALData(insertData, relations)

	select {
	case <-nudgeCh:
	default:
		t.Error("expected watcher to be nudged after INSERT")
	}
}

func TestProcessWALData_DeleteMessage(t *testing.T) {
	backend := newTestBackendForWAL(t)

	nudgeCh := make(chan struct{}, 1)
	w := &postgresWatcher{
		outCh:   make(chan watch.Event, 100),
		nudgeCh: nudgeCh,
		done:    make(chan struct{}),
		ctx:     backend.ctx,
	}
	backend.mu.Lock()
	backend.watchers["Agent/default"] = append(backend.watchers["Agent/default"], w)
	backend.mu.Unlock()

	relations := make(map[uint32]*pglogrepl.RelationMessage)
	relData := encodeRelationMessage(1, "public", "resources", []string{"kind", "namespace", "name"})
	backend.processWALData(relData, relations)

	deleteData := encodeDeleteMessage(1, []string{"Agent", "default", "my-agent"})
	backend.processWALData(deleteData, relations)

	select {
	case <-nudgeCh:
		t.Error("delete messages should not nudge watchers")
	default:
	}
}

func TestNudgeFromTuple_NilTuple(t *testing.T) {
	backend := newTestBackendForWAL(t)
	relations := make(map[uint32]*pglogrepl.RelationMessage)
	relations[1] = &pglogrepl.RelationMessage{RelationID: 1}

	backend.nudgeFromTuple(relations, 1, nil)
}

func TestNudgeFromTuple_UnknownRelation(t *testing.T) {
	backend := newTestBackendForWAL(t)
	relations := make(map[uint32]*pglogrepl.RelationMessage)

	tuple := &pglogrepl.TupleData{
		ColumnNum: 1,
		Columns: []*pglogrepl.TupleDataColumn{
			{DataType: pglogrepl.TupleDataTypeText, Data: []byte("Agent")},
		},
	}

	backend.nudgeFromTuple(relations, 999, tuple)
}

func TestWalStreamState(t *testing.T) {
	state := &walStreamState{
		relations: make(map[uint32]*pglogrepl.RelationMessage),
	}

	if state.relations == nil {
		t.Error("relations map should be initialized")
	}
	if state.lastWriteLSN != 0 {
		t.Error("lastWriteLSN should be zero-value")
	}
	if !state.lastStatusUpdate.IsZero() {
		t.Error("lastStatusUpdate should be zero-value")
	}
}

func TestProcessWALData_InsertNudgesAllNamespaceWatcher(t *testing.T) {
	backend := newTestBackendForWAL(t)

	specificCh := make(chan struct{}, 1)
	allNsCh := make(chan struct{}, 1)

	wSpecific := &postgresWatcher{
		outCh:   make(chan watch.Event, 100),
		nudgeCh: specificCh,
		done:    make(chan struct{}),
		ctx:     backend.ctx,
	}
	wAllNs := &postgresWatcher{
		outCh:   make(chan watch.Event, 100),
		nudgeCh: allNsCh,
		done:    make(chan struct{}),
		ctx:     backend.ctx,
	}

	backend.mu.Lock()
	backend.watchers["Agent/default"] = append(backend.watchers["Agent/default"], wSpecific)
	backend.watchers["Agent/"] = append(backend.watchers["Agent/"], wAllNs)
	backend.mu.Unlock()

	relations := make(map[uint32]*pglogrepl.RelationMessage)
	relData := encodeRelationMessage(1, "public", "resources", []string{"kind", "namespace", "name"})
	backend.processWALData(relData, relations)

	insertData := encodeInsertMessage(1, []string{"Agent", "default", "my-agent"})
	backend.processWALData(insertData, relations)

	select {
	case <-specificCh:
	default:
		t.Error("specific namespace watcher should be nudged")
	}
	select {
	case <-allNsCh:
	default:
		t.Error("all-namespace watcher should be nudged")
	}
}

func TestNudgeAllWatchers(t *testing.T) {
	backend := newTestBackendForWAL(t)

	channels := make([]chan struct{}, 3)
	var watchers []*postgresWatcher
	for i := range channels {
		channels[i] = make(chan struct{}, 1)
		watchers = append(watchers, &postgresWatcher{
			outCh:   make(chan watch.Event, 100),
			nudgeCh: channels[i],
			done:    make(chan struct{}),
			ctx:     backend.ctx,
		})
	}

	backend.mu.Lock()
	backend.watchers["Agent/default"] = watchers[:2]
	backend.watchers["Model/default"] = watchers[2:]
	backend.mu.Unlock()

	backend.nudgeAllWatchers()

	for i, ch := range channels {
		select {
		case <-ch:
		default:
			t.Errorf("watcher %d was not nudged", i)
		}
	}
}

func TestNudgeAllWatchers_ConcurrentSafe(t *testing.T) {
	backend := newTestBackendForWAL(t)

	ch := make(chan struct{}, 1)
	w := &postgresWatcher{
		outCh:   make(chan watch.Event, 100),
		nudgeCh: ch,
		done:    make(chan struct{}),
		ctx:     backend.ctx,
	}
	backend.mu.Lock()
	backend.watchers["Agent/default"] = []*postgresWatcher{w}
	backend.mu.Unlock()

	var wg sync.WaitGroup
	for range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			backend.nudgeAllWatchers()
		}()
	}
	wg.Wait()
}
