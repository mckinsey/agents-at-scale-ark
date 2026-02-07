package environment

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"go.uber.org/zap"
)

type ImageProvisioner struct {
	logger *zap.Logger
}

func NewImageProvisioner(logger *zap.Logger) *ImageProvisioner {
	return &ImageProvisioner{logger: logger}
}

type ImageProvisionParams struct {
	ImageRef   string
	TargetPath string
	SourcePath string
}

func (p *ImageProvisioner) Provision(params ImageProvisionParams) error {
	containerID, err := p.createContainer(params.ImageRef)
	if err != nil {
		return fmt.Errorf("failed to create container from image %s: %w", params.ImageRef, err)
	}
	defer p.removeContainer(containerID)

	sourcePath := params.SourcePath
	if sourcePath == "" {
		sourcePath = "/"
	}

	envPath := filepath.Join(params.TargetPath, "env")
	if err := os.MkdirAll(envPath, 0o755); err != nil {
		return fmt.Errorf("failed to create environment directory: %w", err)
	}

	if err := p.copyFromContainer(containerID, sourcePath, envPath); err != nil {
		return fmt.Errorf("failed to extract from container: %w", err)
	}

	p.logger.Info("image environment extracted",
		zap.String("image", params.ImageRef),
		zap.String("target", envPath),
	)
	return nil
}

func (p *ImageProvisioner) createContainer(imageRef string) (string, error) {
	pullCmd := exec.Command("docker", "pull", imageRef)
	if output, err := pullCmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("docker pull failed: %s: %w", string(output), err)
	}

	createCmd := exec.Command("docker", "create", imageRef)
	output, err := createCmd.Output()
	if err != nil {
		return "", fmt.Errorf("docker create failed: %w", err)
	}

	containerID := strings.TrimSpace(string(output))
	if containerID == "" {
		return "", fmt.Errorf("docker create returned empty container ID")
	}

	return containerID, nil
}

func (p *ImageProvisioner) copyFromContainer(containerID, sourcePath, targetPath string) error {
	cmd := exec.Command("docker", "cp", fmt.Sprintf("%s:%s/.", containerID, sourcePath), targetPath)
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("docker cp failed: %s: %w", string(output), err)
	}
	return nil
}

func (p *ImageProvisioner) removeContainer(containerID string) {
	cmd := exec.Command("docker", "rm", containerID)
	if err := cmd.Run(); err != nil {
		p.logger.Warn("failed to remove container", zap.String("containerID", containerID), zap.Error(err))
	}
}
