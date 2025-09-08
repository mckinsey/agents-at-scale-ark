package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
	"github.com/openai/openai-go"
)

type Message = openai.ChatCompletionMessageParamUnion

type Server struct {
	db        *sql.DB
	logger    *slog.Logger
	tableName string
	// Add maximum limits for safety
	maxSessionIDLength int
	maxMessageSize     int
}

func safeTableName(name string) (string, error) {
	validTableName := regexp.MustCompile(`^[a-zA-Z0-9_]+$`)
	if !validTableName.MatchString(name) {
		return "", fmt.Errorf("invalid table name: must only contain alphanumeric characters and underscores")
	}
	return name, nil
}

func quoteIdentifier(name string) string {
	quoted := fmt.Sprintf("\"%s\"", strings.Replace(name, "\"", "\"\"", -1))
	return quoted
}

type DBExecutor interface {
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
}

func ensureContext(ctx context.Context) (context.Context, context.CancelFunc) {
	if ctx == nil {
		ctx = context.Background()
	}

	_, hasDeadline := ctx.Deadline()
	if !hasDeadline {
		return context.WithTimeout(ctx, 5*time.Second)
	}

	return ctx, func() {}
}

func validateSessionID(sessionID string, maxLength int) error {
	if sessionID == "" {
		return fmt.Errorf("session ID cannot be empty")
	}

	if len(sessionID) > maxLength {
		return fmt.Errorf("session ID exceeds maximum length of %d characters", maxLength)
	}

	validSessionID := regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
	if !validSessionID.MatchString(sessionID) {
		return fmt.Errorf("session ID contains invalid characters")
	}

	return nil
}

func validateMessageSize(messageData interface{}, maxSize int) error {
	switch data := messageData.(type) {
	case json.RawMessage:
		if len(data) > maxSize {
			return fmt.Errorf("message exceeds maximum size of %d bytes", maxSize)
		}
	}
	return nil
}

func (s *Server) safeExec(ctx context.Context, executor DBExecutor, query string, sessionID string, messageData interface{}) (sql.Result, error) {
	ctx, cancel := ensureContext(ctx)
	defer cancel()

	if err := validateSessionID(sessionID, s.maxSessionIDLength); err != nil {
		return nil, fmt.Errorf("invalid session ID: %w", err)
	}

	if err := validateMessageSize(messageData, s.maxMessageSize); err != nil {
		return nil, err
	}

	result, err := executor.ExecContext(ctx, query, sessionID, messageData)
	if err != nil {
		return nil, fmt.Errorf("database execution error: %w", err)
	}

	return result, nil
}

func (s *Server) safeExecWithQuery(ctx context.Context, executor DBExecutor, query string, sessionID, queryID string, messageData interface{}) (sql.Result, error) {
	ctx, cancel := ensureContext(ctx)
	defer cancel()

	if err := validateSessionID(sessionID, s.maxSessionIDLength); err != nil {
		return nil, fmt.Errorf("invalid session ID: %w", err)
	}

	if queryID == "" {
		return nil, fmt.Errorf("query ID cannot be empty")
	}

	if len(queryID) > s.maxSessionIDLength { // Reuse same validation for queryID
		return nil, fmt.Errorf("query ID exceeds maximum length of %d characters", s.maxSessionIDLength)
	}

	if err := validateMessageSize(messageData, s.maxMessageSize); err != nil {
		return nil, err
	}

	result, err := executor.ExecContext(ctx, query, sessionID, queryID, messageData)
	if err != nil {
		return nil, fmt.Errorf("database execution error: %w", err)
	}

	return result, nil
}

func New(dsn, tableName string, logger *slog.Logger) (*Server, error) {
	safeTable, err := safeTableName(tableName)
	if err != nil {
		return nil, fmt.Errorf("validate table name: %w", err)
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	s := &Server{
		db:                 db,
		logger:             logger,
		tableName:          safeTable,
		maxSessionIDLength: 255,              // Reasonable limit for session IDs
		maxMessageSize:     10 * 1024 * 1024, // 10MB max message size
	}
	if err := s.migrate(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate database: %w", err)
	}

	return s, nil
}

func (s *Server) migrate(ctx context.Context) error {
	quotedTable := quoteIdentifier(s.tableName)
	idxSessionName := quoteIdentifier(fmt.Sprintf("idx_%s_session_id", s.tableName))
	idxCreatedName := quoteIdentifier(fmt.Sprintf("idx_%s_created_at", s.tableName))

	idxQueryName := quoteIdentifier(fmt.Sprintf("idx_%s_query_id", s.tableName))

	query := fmt.Sprintf(`
		CREATE TABLE IF NOT EXISTS %s (
			id BIGSERIAL PRIMARY KEY,
			session_id TEXT NOT NULL,
			query_id TEXT NOT NULL,
			message JSONB NOT NULL,
			created_at TIMESTAMPTZ DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS %s ON %s(session_id);
		CREATE INDEX IF NOT EXISTS %s ON %s(query_id);
		CREATE INDEX IF NOT EXISTS %s ON %s(created_at);
	`, quotedTable, idxSessionName, quotedTable, idxQueryName, quotedTable, idxCreatedName, quotedTable)
	_, err := s.db.ExecContext(ctx, query)
	return err
}

func (s *Server) Close() error {
	return s.db.Close()
}

func (s *Server) addMessage(ctx context.Context, sessionID, queryID string, message Message) error {
	data, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("marshal message: %w", err)
	}

	query := fmt.Sprintf(`INSERT INTO %s (session_id, query_id, message) VALUES ($1, $2, $3)`, quoteIdentifier(s.tableName))
	_, err = s.safeExecWithQuery(ctx, s.db, query, sessionID, queryID, data)
	if err != nil {
		return fmt.Errorf("insert message: %w", err)
	}

	return nil
}

func (s *Server) addRawMessage(ctx context.Context, sessionID, queryID string, messageData json.RawMessage) error {
	query := fmt.Sprintf(`INSERT INTO %s (session_id, query_id, message) VALUES ($1, $2, $3)`, quoteIdentifier(s.tableName))
	_, err := s.safeExecWithQuery(ctx, s.db, query, sessionID, queryID, messageData)
	if err != nil {
		return fmt.Errorf("insert message: %w", err)
	}

	return nil
}

func (s *Server) addRawMessages(ctx context.Context, sessionID, queryID string, messages []json.RawMessage) error {
	if len(messages) == 0 {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback()

	query := fmt.Sprintf(`INSERT INTO %s (session_id, query_id, message) VALUES ($1, $2, $3)`, quoteIdentifier(s.tableName))

	for _, message := range messages {
		if _, err := s.safeExecWithQuery(ctx, tx, query, sessionID, queryID, message); err != nil {
			return fmt.Errorf("insert message: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}

	return nil
}

// MessageRecord represents a complete message record from the database
type MessageRecord struct {
	ID        int64           `json:"id"`
	SessionID string          `json:"session_id"`
	QueryID   string          `json:"query_id"`
	Message   json.RawMessage `json:"message"`
	CreatedAt string          `json:"created_at"`
}

func (s *Server) getAllMessages(ctx context.Context, sessionID, queryID string, limit, offset int) ([]MessageRecord, int, error) {
	baseQuery := fmt.Sprintf(`SELECT id, session_id, query_id, message, created_at FROM %s`, quoteIdentifier(s.tableName))
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM %s`, quoteIdentifier(s.tableName))

	var whereClauses []string
	var args []interface{}
	argIndex := 1

	// Build WHERE clauses based on provided filters
	if sessionID != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("session_id = $%d", argIndex))
		args = append(args, sessionID)
		argIndex++
	}

	if queryID != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("query_id = $%d", argIndex))
		args = append(args, queryID)
		argIndex++
	}

	whereClause := ""
	if len(whereClauses) > 0 {
		whereClause = " WHERE " + strings.Join(whereClauses, " AND ")
	}

	// Get total count
	var totalCount int
	err := s.db.QueryRowContext(ctx, countQuery+whereClause, args...).Scan(&totalCount)
	if err != nil {
		return nil, 0, fmt.Errorf("count messages: %w", err)
	}

	// Add ORDER BY and LIMIT/OFFSET
	fullQuery := baseQuery + whereClause + " ORDER BY created_at ASC"
	if limit > 0 {
		fullQuery += fmt.Sprintf(" LIMIT $%d", argIndex)
		args = append(args, limit)
		argIndex++

		if offset > 0 {
			fullQuery += fmt.Sprintf(" OFFSET $%d", argIndex)
			args = append(args, offset)
		}
	}

	rows, err := s.db.QueryContext(ctx, fullQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("query messages: %w", err)
	}
	defer rows.Close()

	var messages []MessageRecord
	for rows.Next() {
		var record MessageRecord
		var createdAt time.Time

		if err := rows.Scan(&record.ID, &record.SessionID, &record.QueryID, &record.Message, &createdAt); err != nil {
			return nil, 0, fmt.Errorf("scan message: %w", err)
		}

		record.CreatedAt = createdAt.Format(time.RFC3339)
		messages = append(messages, record)
	}

	return messages, totalCount, rows.Err()
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if err := s.db.PingContext(ctx); err != nil {
		s.logger.Error("health check failed", "error", err)
		http.Error(w, "Database unavailable", http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func (s *Server) handleMessages(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		s.handleAddMessages(w, r)
	case http.MethodGet:
		s.handleGetMessages(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleAddMessages(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string            `json:"session_id"`
		QueryID   string            `json:"query_id"`
		Messages  []json.RawMessage `json:"messages"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.logger.Error("decode request", "error", err)
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.SessionID == "" || req.QueryID == "" {
		http.Error(w, "session_id and query_id are required", http.StatusBadRequest)
		return
	}

	if len(req.Messages) == 0 {
		http.Error(w, "messages array cannot be empty", http.StatusBadRequest)
		return
	}

	if err := s.addRawMessages(r.Context(), req.SessionID, req.QueryID, req.Messages); err != nil {
		s.logger.Error("add messages", "error", err, "session", req.SessionID, "query", req.QueryID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleGetMessages(w http.ResponseWriter, r *http.Request) {
	// Parse query parameters for filtering
	sessionID := r.URL.Query().Get("session_id")
	queryID := r.URL.Query().Get("query_id")

	// Parse pagination parameters
	limit := 50 // default
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 && parsed <= 1000 {
			limit = parsed
		}
	}

	offset := 0
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if parsed, err := strconv.Atoi(offsetStr); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	messages, total, err := s.getAllMessages(r.Context(), sessionID, queryID, limit, offset)
	if err != nil {
		s.logger.Error("get messages", "error", err, "session", sessionID, "query", queryID)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Ensure messages is never null - use empty slice if nil
	if messages == nil {
		messages = []MessageRecord{}
	}

	response := struct {
		Messages []MessageRecord `json:"messages"`
		Total    int             `json:"total"`
		Limit    int             `json:"limit"`
		Offset   int             `json:"offset"`
	}{
		Messages: messages,
		Total:    total,
		Limit:    limit,
		Offset:   offset,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		s.logger.Error("encode response", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

func (s *Server) getSessions(ctx context.Context) ([]string, error) {
	baseQuery := fmt.Sprintf(`SELECT DISTINCT session_id FROM %s ORDER BY session_id`, quoteIdentifier(s.tableName))
	
	rows, err := s.db.QueryContext(ctx, baseQuery)
	if err != nil {
		return nil, fmt.Errorf("query sessions: %w", err)
	}
	defer rows.Close()
	
	var sessions []string
	for rows.Next() {
		var sessionID string
		if err := rows.Scan(&sessionID); err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		sessions = append(sessions, sessionID)
	}
	
	return sessions, rows.Err()
}

func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	sessions, err := s.getSessions(r.Context())
	if err != nil {
		s.logger.Error("get sessions", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	
	response := map[string]interface{}{
		"sessions": sessions,
	}
	
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		s.logger.Error("encode sessions response", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

func (s *Server) routes() http.Handler {
	r := mux.NewRouter()
	r.HandleFunc("/messages", s.handleMessages)
	r.HandleFunc("/sessions", s.handleSessions)
	r.HandleFunc("/health", s.handleHealth)
	return r
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		logger.Error("DATABASE_URL not set in env.")
		os.Exit(1)
	}

	tableName := os.Getenv("TABLE_NAME")
	if tableName == "" {
		tableName = "messages"
	}

	if _, err := safeTableName(tableName); err != nil {
		logger.Error("Invalid table name", "error", err)
		os.Exit(1)
	}

	server, err := New(dsn, tableName, logger)
	if err != nil {
		logger.Error("create server", "error", err)
		os.Exit(1)
	}
	defer server.Close()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      server.routes(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		logger.Info("starting server with sessions endpoint", "port", port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server error", "error", err)
		}
	}()

	<-done
	logger.Info("shutting down server")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("shutdown error", "error", err)
	}
}
