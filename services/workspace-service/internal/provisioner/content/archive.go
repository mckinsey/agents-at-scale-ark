package content

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"go.uber.org/zap"
)

type ArchiveProvisioner struct {
	logger *zap.Logger
}

func NewArchiveProvisioner(logger *zap.Logger) *ArchiveProvisioner {
	return &ArchiveProvisioner{logger: logger}
}

func (p *ArchiveProvisioner) Provision(params ProvisionParams) error {
	url, _ := params.Config["url"].(string)
	format, _ := params.Config["format"].(string)

	if url == "" {
		return fmt.Errorf("url is required for archive provisioner")
	}

	if format == "" {
		format = "tar.gz"
	}

	archivePath := filepath.Join(params.TargetPath, fmt.Sprintf("archive.%s", format))

	if err := p.download(url, archivePath, params.Credentials); err != nil {
		return fmt.Errorf("failed to download archive: %w", err)
	}
	defer os.Remove(archivePath)

	if err := p.extract(archivePath, format, params.TargetPath); err != nil {
		return fmt.Errorf("failed to extract archive: %w", err)
	}

	p.logger.Info("archive provisioned", zap.String("url", url), zap.String("target", params.TargetPath))
	return nil
}

func (p *ArchiveProvisioner) download(url, targetPath string, credentials map[string]string) error {
	client := &http.Client{Timeout: 5 * time.Minute}

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	if token, ok := credentials["token"]; ok {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("download request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download returned status %d", resp.StatusCode)
	}

	out, err := os.Create(targetPath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer out.Close()

	if _, err := io.Copy(out, resp.Body); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}

func (p *ArchiveProvisioner) extract(archivePath, format, targetPath string) error {
	switch format {
	case "tar.gz":
		cmd := exec.Command("tar", "xzf", archivePath, "-C", targetPath)
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("tar extraction failed: %s: %w", string(output), err)
		}
	case "zip":
		cmd := exec.Command("unzip", "-o", archivePath, "-d", targetPath)
		if output, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("unzip failed: %s: %w", string(output), err)
		}
	default:
		return fmt.Errorf("unsupported archive format: %s", format)
	}
	return nil
}
