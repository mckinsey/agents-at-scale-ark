package workspace

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"go.uber.org/zap"
)

func TestCleanOrphans_RemovesStaleWorkspacesIndividually(t *testing.T) {
	base := t.TempDir()
	logger := zap.NewNop()

	queryPath := filepath.Join(base, "ephemeral", "query-1")
	staleWs := filepath.Join(queryPath, "ws-stale")
	freshWs := filepath.Join(queryPath, "ws-fresh")

	if err := os.MkdirAll(staleWs, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(freshWs, 0o755); err != nil {
		t.Fatal(err)
	}

	staleTime := time.Now().Add(-2 * time.Hour)
	os.Chtimes(staleWs, staleTime, staleTime)

	cleaner := NewOrphanCleaner(logger, base, 1*time.Hour)
	cleaner.cleanOrphans()

	if _, err := os.Stat(staleWs); !os.IsNotExist(err) {
		t.Error("stale workspace should have been removed")
	}
	if _, err := os.Stat(freshWs); err != nil {
		t.Error("fresh workspace should still exist")
	}
	if _, err := os.Stat(queryPath); err != nil {
		t.Error("query directory should still exist (has remaining workspace)")
	}
}

func TestCleanOrphans_RemovesEmptyQueryDir(t *testing.T) {
	base := t.TempDir()
	logger := zap.NewNop()

	queryPath := filepath.Join(base, "ephemeral", "query-1")
	staleWs := filepath.Join(queryPath, "ws-stale")

	if err := os.MkdirAll(staleWs, 0o755); err != nil {
		t.Fatal(err)
	}

	staleTime := time.Now().Add(-2 * time.Hour)
	os.Chtimes(staleWs, staleTime, staleTime)

	cleaner := NewOrphanCleaner(logger, base, 1*time.Hour)
	cleaner.cleanOrphans()

	if _, err := os.Stat(staleWs); !os.IsNotExist(err) {
		t.Error("stale workspace should have been removed")
	}
	if _, err := os.Stat(queryPath); !os.IsNotExist(err) {
		t.Error("empty query directory should have been removed")
	}
}

func TestCleanOrphans_MultipleQueryDirs(t *testing.T) {
	base := t.TempDir()
	logger := zap.NewNop()

	q1Ws := filepath.Join(base, "ephemeral", "query-1", "ws-1")
	q2Ws := filepath.Join(base, "ephemeral", "query-2", "ws-2")

	if err := os.MkdirAll(q1Ws, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(q2Ws, 0o755); err != nil {
		t.Fatal(err)
	}

	staleTime := time.Now().Add(-2 * time.Hour)
	os.Chtimes(q1Ws, staleTime, staleTime)

	cleaner := NewOrphanCleaner(logger, base, 1*time.Hour)
	cleaner.cleanOrphans()

	if _, err := os.Stat(q1Ws); !os.IsNotExist(err) {
		t.Error("stale workspace in query-1 should have been removed")
	}
	if _, err := os.Stat(filepath.Join(base, "ephemeral", "query-1")); !os.IsNotExist(err) {
		t.Error("empty query-1 directory should have been removed")
	}
	if _, err := os.Stat(q2Ws); err != nil {
		t.Error("fresh workspace in query-2 should still exist")
	}
}

func TestCleanOrphans_NoEphemeralDir(t *testing.T) {
	base := t.TempDir()
	logger := zap.NewNop()

	cleaner := NewOrphanCleaner(logger, base, 1*time.Hour)
	cleaner.cleanOrphans()
}

func TestCleanOrphans_SkipsFiles(t *testing.T) {
	base := t.TempDir()
	logger := zap.NewNop()

	ephemeralPath := filepath.Join(base, "ephemeral")
	if err := os.MkdirAll(ephemeralPath, 0o755); err != nil {
		t.Fatal(err)
	}

	filePath := filepath.Join(ephemeralPath, "stale-file.txt")
	if err := os.WriteFile(filePath, []byte("test"), 0o644); err != nil {
		t.Fatal(err)
	}
	staleTime := time.Now().Add(-2 * time.Hour)
	os.Chtimes(filePath, staleTime, staleTime)

	cleaner := NewOrphanCleaner(logger, base, 1*time.Hour)
	cleaner.cleanOrphans()

	if _, err := os.Stat(filePath); err != nil {
		t.Error("files at the query-dir level should be ignored")
	}
}
