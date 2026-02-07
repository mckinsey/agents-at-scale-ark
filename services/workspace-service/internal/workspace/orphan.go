package workspace

import (
	"os"
	"path/filepath"
	"time"

	"go.uber.org/zap"
)

type OrphanCleaner struct {
	logger      *zap.Logger
	basePath    string
	gracePeriod time.Duration
}

func NewOrphanCleaner(logger *zap.Logger, basePath string, gracePeriod time.Duration) *OrphanCleaner {
	return &OrphanCleaner{
		logger:      logger,
		basePath:    basePath,
		gracePeriod: gracePeriod,
	}
}

func (c *OrphanCleaner) Start() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		c.cleanOrphans()
	}
}

func (c *OrphanCleaner) cleanOrphans() {
	ephemeralPath := filepath.Join(c.basePath, "ephemeral")
	queryDirs, err := os.ReadDir(ephemeralPath)
	if err != nil {
		if !os.IsNotExist(err) {
			c.logger.Warn("failed to read ephemeral directory", zap.Error(err))
		}
		return
	}

	now := time.Now()
	for _, queryDir := range queryDirs {
		if !queryDir.IsDir() {
			continue
		}
		queryPath := filepath.Join(ephemeralPath, queryDir.Name())
		workspaceDirs, err := os.ReadDir(queryPath)
		if err != nil {
			continue
		}

		for _, wsDir := range workspaceDirs {
			if !wsDir.IsDir() {
				continue
			}
			info, err := wsDir.Info()
			if err != nil {
				continue
			}
			if now.Sub(info.ModTime()) > c.gracePeriod {
				wsPath := filepath.Join(queryPath, wsDir.Name())
				if err := os.RemoveAll(wsPath); err != nil {
					c.logger.Warn("failed to remove orphaned workspace",
						zap.String("path", wsPath), zap.Error(err))
				} else {
					c.logger.Info("removed orphaned workspace",
						zap.String("path", wsPath))
				}
			}
		}

		remaining, _ := os.ReadDir(queryPath)
		if len(remaining) == 0 {
			os.Remove(queryPath)
		}
	}
}
