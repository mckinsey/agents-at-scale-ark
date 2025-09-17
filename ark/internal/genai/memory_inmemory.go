package genai

import (
	"context"
	"fmt"
	"sync"

	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

// InMemoryStore represents a thread-safe in-memory storage for conversation messages
type InMemoryStore struct {
	mu       sync.RWMutex
	sessions map[string][]Message // sessionId -> messages
}

// NewInMemoryStore creates a new in-memory storage instance
func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		sessions: make(map[string][]Message),
	}
}

// AddMessages adds messages to a session
func (store *InMemoryStore) AddMessages(sessionId string, messages []Message) {
	store.mu.Lock()
	defer store.mu.Unlock()

	if store.sessions[sessionId] == nil {
		store.sessions[sessionId] = make([]Message, 0)
	}
	store.sessions[sessionId] = append(store.sessions[sessionId], messages...)
}

// GetMessages retrieves all messages for a session
func (store *InMemoryStore) GetMessages(sessionId string) []Message {
	store.mu.RLock()
	defer store.mu.RUnlock()

	messages := store.sessions[sessionId]
	if messages == nil {
		return []Message{}
	}

	// Return a copy to prevent external modification
	result := make([]Message, len(messages))
	copy(result, messages)
	return result
}

// ClearSession removes all messages for a session
func (store *InMemoryStore) ClearSession(sessionId string) {
	store.mu.Lock()
	defer store.mu.Unlock()

	delete(store.sessions, sessionId)
}

// GetSessionCount returns the number of active sessions
func (store *InMemoryStore) GetSessionCount() int {
	store.mu.RLock()
	defer store.mu.RUnlock()

	return len(store.sessions)
}

// GetAllSessions returns a list of all session IDs
func (store *InMemoryStore) GetAllSessions() []string {
	store.mu.RLock()
	defer store.mu.RUnlock()

	sessions := make([]string, 0, len(store.sessions))
	for sessionId := range store.sessions {
		sessions = append(sessions, sessionId)
	}
	return sessions
}

// Global in-memory store instance (singleton)
var globalInMemoryStore = NewInMemoryStore()

// InMemoryMemory implements MemoryInterface using in-memory storage
type InMemoryMemory struct {
	store     *InMemoryStore
	sessionId string
	name      string
	namespace string
	recorder  EventEmitter
}

// NewInMemoryMemory creates a new in-memory memory instance
func NewInMemoryMemory(ctx context.Context, k8sClient client.Client, memoryName, namespace string, recorder EventEmitter, config Config) (MemoryInterface, error) {
	if memoryName == "" || namespace == "" {
		return nil, fmt.Errorf("memoryName and namespace are required")
	}

	sessionId := config.SessionId
	if sessionId == "" {
		return nil, fmt.Errorf("sessionId is required for in-memory storage")
	}

	logCtx := logf.FromContext(ctx)
	logCtx.Info("Creating in-memory memory store",
		"memoryName", memoryName,
		"namespace", namespace,
		"sessionId", sessionId)

	return &InMemoryMemory{
		store:     globalInMemoryStore,
		sessionId: sessionId,
		name:      memoryName,
		namespace: namespace,
		recorder:  recorder,
	}, nil
}

// AddMessages stores messages in memory for the session
func (m *InMemoryMemory) AddMessages(ctx context.Context, queryID string, messages []Message) error {
	if len(messages) == 0 {
		return nil
	}

	logCtx := logf.FromContext(ctx)
	logCtx.Info("Adding messages to in-memory store",
		"sessionId", m.sessionId,
		"queryId", queryID,
		"messageCount", len(messages))

	tracker := NewOperationTracker(m.recorder, ctx, "MemoryAddMessages", m.name, map[string]string{
		"namespace":   m.namespace,
		"sessionId":   m.sessionId,
		"queryId":     queryID,
		"messages":    fmt.Sprintf("%d", len(messages)),
		"storageType": MemoryTypeInMemory,
	})

	// Validate messages before storing
	// Validate we have messages to add
	if len(messages) == 0 {
		tracker.Complete("success")
		return nil
	}

	// Store messages in the global in-memory store
	m.store.AddMessages(m.sessionId, messages)

	tracker.Complete("messages added to in-memory store")
	return nil
}

// GetMessages retrieves all messages for the session from memory
func (m *InMemoryMemory) GetMessages(ctx context.Context) ([]Message, error) {
	logCtx := logf.FromContext(ctx)
	logCtx.Info("Retrieving messages from in-memory store", "sessionId", m.sessionId)

	tracker := NewOperationTracker(m.recorder, ctx, "MemoryGetMessages", m.name, map[string]string{
		"namespace":   m.namespace,
		"sessionId":   m.sessionId,
		"storageType": MemoryTypeInMemory,
	})

	// Retrieve messages from the global in-memory store
	messages := m.store.GetMessages(m.sessionId)

	logCtx.Info("Retrieved messages from in-memory store",
		"sessionId", m.sessionId,
		"messageCount", len(messages))

	// Update metadata with message count
	tracker.metadata["messages"] = fmt.Sprintf("%d", len(messages))
	tracker.Complete("retrieved from in-memory store")

	return messages, nil
}

// Close cleans up the memory instance (no persistent resources to clean up)
func (m *InMemoryMemory) Close() error {
	// In-memory storage doesn't need explicit cleanup
	// Messages remain in the global store for other instances with the same sessionId
	return nil
}

// ClearSession removes all messages for this session (utility method)
func (m *InMemoryMemory) ClearSession(ctx context.Context) error {
	logCtx := logf.FromContext(ctx)
	logCtx.Info("Clearing session from in-memory store", "sessionId", m.sessionId)

	m.store.ClearSession(m.sessionId)

	if m.recorder != nil {
		eventData := BaseEvent{
			Name: "SessionCleared",
			Metadata: map[string]string{
				"sessionId": m.sessionId,
				"message":   fmt.Sprintf("Cleared session %s from in-memory store", m.sessionId),
			},
		}
		m.recorder.EmitEvent(ctx, "Normal", "SessionCleared", eventData)
	}

	return nil
}

// GetSessionInfo returns information about the current session (utility method)
func (m *InMemoryMemory) GetSessionInfo(ctx context.Context) (map[string]interface{}, error) {
	messages := m.store.GetMessages(m.sessionId)

	info := map[string]interface{}{
		"sessionId":     m.sessionId,
		"messageCount":  len(messages),
		"storageType":   MemoryTypeInMemory,
		"memoryName":    m.name,
		"namespace":     m.namespace,
		"totalSessions": m.store.GetSessionCount(),
	}

	return info, nil
}
