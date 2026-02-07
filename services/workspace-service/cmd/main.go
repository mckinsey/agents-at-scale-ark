package main

import (
	"flag"
	"os"

	"go.uber.org/zap"

	"mckinsey.com/workspace-service/internal/provisioner/content"
	"mckinsey.com/workspace-service/internal/provisioner/environment"
	"mckinsey.com/workspace-service/internal/server"
	"mckinsey.com/workspace-service/internal/workspace"
)

func main() {
	addr := flag.String("addr", ":8090", "HTTP server listen address")
	basePath := flag.String("base-path", "/workspaces", "Base path for workspace storage")
	orphanGracePeriod := flag.Duration("orphan-grace-period", 3600000000000, "Grace period before cleaning orphaned workspaces")
	flag.Parse()

	logger, err := zap.NewProduction()
	if err != nil {
		os.Exit(1)
	}
	defer logger.Sync()

	gitProvisioner := content.NewGitProvisioner(logger)
	emptyProvisioner := content.NewEmptyProvisioner(logger)
	objectStorageProvisioner := content.NewObjectStorageProvisioner(logger)
	archiveProvisioner := content.NewArchiveProvisioner(logger)
	imageProvisioner := environment.NewImageProvisioner(logger)

	mgr := workspace.NewManager(logger, *basePath, map[string]content.Provisioner{
		"git":           gitProvisioner,
		"empty":         emptyProvisioner,
		"objectStorage": objectStorageProvisioner,
		"archive":       archiveProvisioner,
	}, imageProvisioner)

	cleaner := workspace.NewOrphanCleaner(logger, *basePath, *orphanGracePeriod)
	go cleaner.Start()

	srv := server.New(logger, *addr, mgr)

	logger.Info("starting workspace-service", zap.String("addr", *addr), zap.String("basePath", *basePath))
	if err := srv.ListenAndServe(); err != nil {
		logger.Fatal("server failed", zap.Error(err))
	}
}
