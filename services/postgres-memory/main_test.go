package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gorilla/mux"
	"github.com/openai/openai-go"
)

func setupTestServer(t *testing.T) *Server {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set, skipping database tests")
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	server, err := New(dsn, "messages", logger)
	if err != nil {
		t.Fatalf("create test server: %v", err)
	}

	// Clean test data
	_, err = server.db.Exec("DELETE FROM messages")
	if err != nil {
		t.Fatalf("clean test database: %v", err)
	}

	return server
}

func TestServer_AddMessage(t *testing.T) {
	server := setupTestServer(t)
	defer server.Close()

	ctx := context.Background()
	sessionID := "test-session"
	queryID := "test-query"
	message := Message(openai.UserMessage("Hello, world!"))

	err := server.addMessage(ctx, sessionID, queryID, message)
	if err != nil {
		t.Fatalf("addMessage failed: %v", err)
	}

	var count int
	err = server.db.QueryRow("SELECT COUNT(*) FROM messages WHERE session_id = $1 AND query_id = $2", sessionID, queryID).Scan(&count)
	if err != nil {
		t.Fatalf("count messages: %v", err)
	}

	if count != 1 {
		t.Errorf("expected 1 message, got %d", count)
	}
}

func TestServer_GetMessages(t *testing.T) {
	server := setupTestServer(t)
	defer server.Close()

	ctx := context.Background()
	sessionID := "test-session"
	queryID := "test-query"

	messages := []Message{
		Message(openai.UserMessage("First message")),
		Message(openai.AssistantMessage("Second message")),
	}

	for i, msg := range messages {
		testQueryID := queryID + "-" + string(rune(i+'1')) // Make unique query IDs
		if err := server.addMessage(ctx, sessionID, testQueryID, msg); err != nil {
			t.Fatalf("addMessage failed: %v", err)
		}
	}

	// Test retrieving by session ID (should get all messages for this session)
	retrieved, _, err := server.getAllMessages(ctx, sessionID, "", 0, 0)
	if err != nil {
		t.Fatalf("getAllMessages failed: %v", err)
	}

	if len(retrieved) != len(messages) {
		t.Errorf("expected %d messages, got %d", len(messages), len(retrieved))
	}
}

func TestServer_HTTPHandlers(t *testing.T) {
	server := setupTestServer(t)
	defer server.Close()

	router := server.routes().(*mux.Router)

	t.Run("AddMessage", func(t *testing.T) {
		req := struct {
			Message Message `json:"message"`
		}{Message: Message(openai.UserMessage("Test message"))}

		body, _ := json.Marshal(req)
		httpReq := httptest.NewRequest(http.MethodPut, "/messages?session_id=test-session&query_id=test-query", bytes.NewBuffer(body))
		httpReq.Header.Set("Content-Type", "application/json")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, httpReq)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d", w.Code)
		}
	})

	t.Run("GetMessages", func(t *testing.T) {
		httpReq := httptest.NewRequest(http.MethodGet, "/messages?session_id=test-session", nil)

		w := httptest.NewRecorder()
		router.ServeHTTP(w, httpReq)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d", w.Code)
		}

		var response struct {
			Messages []MessageRecord `json:"messages"`
			Total    int             `json:"total"`
		}
		if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
			t.Fatalf("decode response: %v", err)
		}

		if len(response.Messages) == 0 {
			t.Error("expected at least one message")
		}
	})

	t.Run("Health", func(t *testing.T) {
		httpReq := httptest.NewRequest(http.MethodGet, "/health", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httpReq)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d", w.Code)
		}

		if w.Body.String() != "OK" {
			t.Errorf("expected 'OK', got %q", w.Body.String())
		}
	})
}

func TestServer_Filtering(t *testing.T) {
	server := setupTestServer(t)
	defer server.Close()

	ctx := context.Background()

	// Add test messages
	server.addMessage(ctx, "session-1", "query-1", Message(openai.UserMessage("Test 1")))
	server.addMessage(ctx, "session-2", "query-1", Message(openai.UserMessage("Test 2")))

	// Test filtering by session
	_, total, err := server.getAllMessages(ctx, "session-1", "", 0, 0)
	if err != nil || total != 1 {
		t.Errorf("filter by session failed: err=%v, total=%d", err, total)
	}

	// Test filtering by query
	_, total, err = server.getAllMessages(ctx, "", "query-1", 0, 0)
	if err != nil || total != 2 {
		t.Errorf("filter by query failed: err=%v, total=%d", err, total)
	}
}

func TestJSONMarshalingBehavior(t *testing.T) {
	t.Run("NilSliceMarshalsAsNull", func(t *testing.T) {
		var nilSlice []MessageRecord
		response := struct {
			Messages []MessageRecord `json:"messages"`
			Total    int             `json:"total"`
		}{
			Messages: nilSlice,
			Total:    0,
		}
		
		data, err := json.Marshal(response)
		if err != nil {
			t.Fatalf("marshal failed: %v", err)
		}
		
		if !bytes.Contains(data, []byte(`"messages":null`)) {
			t.Errorf("expected nil slice to marshal as null, but got: %s", string(data))
		}
	})
	
	t.Run("EmptySliceMarshalsAsArray", func(t *testing.T) {
		emptySlice := []MessageRecord{}
		response := struct {
			Messages []MessageRecord `json:"messages"`
			Total    int             `json:"total"`
		}{
			Messages: emptySlice,
			Total:    0,
		}
		
		data, err := json.Marshal(response)
		if err != nil {
			t.Fatalf("marshal failed: %v", err)
		}
		
		if !bytes.Contains(data, []byte(`"messages":[]`)) {
			t.Errorf("expected empty slice to marshal as [], but got: %s", string(data))
		}
	})
	
	t.Run("NilSliceFixWorksCorrectly", func(t *testing.T) {
		var nilSlice []MessageRecord
		
		// Apply the fix: convert nil to empty slice
		if nilSlice == nil {
			nilSlice = []MessageRecord{}
		}
		
		response := struct {
			Messages []MessageRecord `json:"messages"`
			Total    int             `json:"total"`
		}{
			Messages: nilSlice,
			Total:    0,
		}
		
		data, err := json.Marshal(response)
		if err != nil {
			t.Fatalf("marshal failed: %v", err)
		}
		
		if !bytes.Contains(data, []byte(`"messages":[]`)) {
			t.Errorf("expected fixed nil slice to marshal as [], but got: %s", string(data))
		}
	})
}

func TestServer_EmptyMessagesResponse(t *testing.T) {
	server := setupTestServer(t)
	defer server.Close()

	router := server.routes().(*mux.Router)

	t.Run("EmptyMessages", func(t *testing.T) {
		// Query for messages that don't exist
		httpReq := httptest.NewRequest(http.MethodGet, "/messages?session_id=nonexistent", nil)

		w := httptest.NewRecorder()
		router.ServeHTTP(w, httpReq)

		if w.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d", w.Code)
		}

		var response struct {
			Messages []MessageRecord `json:"messages"`
			Total    int             `json:"total"`
			Limit    int             `json:"limit"`
			Offset   int             `json:"offset"`
		}
		if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
			t.Fatalf("decode response: %v", err)
		}

		// Verify messages is an empty array, not null
		if response.Messages == nil {
			t.Error("messages field should be empty array [], not null")
		}

		if len(response.Messages) != 0 {
			t.Errorf("expected 0 messages, got %d", len(response.Messages))
		}

		if response.Total != 0 {
			t.Errorf("expected total 0, got %d", response.Total)
		}

		// Also verify the raw JSON contains [] not null
		rawBody := w.Body.String()
		if !bytes.Contains([]byte(rawBody), []byte(`"messages":[]`)) {
			t.Errorf("expected messages field to be [], but got: %s", rawBody)
		}
	})
}
