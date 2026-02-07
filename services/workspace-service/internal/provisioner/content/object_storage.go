package content

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"go.uber.org/zap"
)

type ObjectStorageProvisioner struct {
	logger *zap.Logger
}

func NewObjectStorageProvisioner(logger *zap.Logger) *ObjectStorageProvisioner {
	return &ObjectStorageProvisioner{logger: logger}
}

func (p *ObjectStorageProvisioner) Provision(params ProvisionParams) error {
	provider, _ := params.Config["provider"].(string)
	bucket, _ := params.Config["bucket"].(string)
	prefix, _ := params.Config["prefix"].(string)

	if bucket == "" {
		return fmt.Errorf("bucket is required for object storage provisioner")
	}

	switch provider {
	case "s3":
		return p.syncS3(bucket, prefix, params.TargetPath, params.Credentials)
	case "gcs":
		return p.syncGCS(bucket, prefix, params.TargetPath, params.Credentials)
	case "azure":
		return p.syncAzure(bucket, prefix, params.TargetPath, params.Credentials)
	default:
		return fmt.Errorf("unsupported object storage provider: %s", provider)
	}
}

func (p *ObjectStorageProvisioner) syncS3(bucket, prefix, targetPath string, credentials map[string]string) error {
	source := fmt.Sprintf("s3://%s", bucket)
	if prefix != "" {
		source = fmt.Sprintf("s3://%s/%s", bucket, strings.TrimPrefix(prefix, "/"))
	}

	args := []string{"s3", "sync", source, targetPath}

	cmd := exec.Command("aws", args...)
	cmd.Env = os.Environ()

	if region, ok := credentials["region"]; ok {
		cmd.Env = append(cmd.Env, fmt.Sprintf("AWS_DEFAULT_REGION=%s", region))
	}
	if key, ok := credentials["accessKeyId"]; ok {
		cmd.Env = append(cmd.Env, fmt.Sprintf("AWS_ACCESS_KEY_ID=%s", key))
	}
	if secret, ok := credentials["secretAccessKey"]; ok {
		cmd.Env = append(cmd.Env, fmt.Sprintf("AWS_SECRET_ACCESS_KEY=%s", secret))
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("aws s3 sync failed: %s: %w", string(output), err)
	}

	p.logger.Info("s3 sync completed", zap.String("bucket", bucket), zap.String("target", targetPath))
	return nil
}

func (p *ObjectStorageProvisioner) syncGCS(bucket, prefix, targetPath string, credentials map[string]string) error {
	source := fmt.Sprintf("gs://%s", bucket)
	if prefix != "" {
		source = fmt.Sprintf("gs://%s/%s", bucket, strings.TrimPrefix(prefix, "/"))
	}

	args := []string{"-m", "rsync", "-r", source, targetPath}
	cmd := exec.Command("gsutil", args...)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("gsutil rsync failed: %s: %w", string(output), err)
	}

	p.logger.Info("gcs sync completed", zap.String("bucket", bucket), zap.String("target", targetPath))
	return nil
}

func (p *ObjectStorageProvisioner) syncAzure(container, prefix, targetPath string, credentials map[string]string) error {
	source := fmt.Sprintf("https://%s.blob.core.windows.net/%s", credentials["storageAccount"], container)
	if prefix != "" {
		source = fmt.Sprintf("%s/%s", source, strings.TrimPrefix(prefix, "/"))
	}

	args := []string{"storage", "blob", "download-batch", "--destination", targetPath, "--source", container}

	if account, ok := credentials["storageAccount"]; ok {
		args = append(args, "--account-name", account)
	}
	if key, ok := credentials["storageKey"]; ok {
		args = append(args, "--account-key", key)
	}

	cmd := exec.Command("az", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("az storage download failed: %s: %w", string(output), err)
	}

	p.logger.Info("azure blob sync completed", zap.String("container", container), zap.String("target", targetPath))
	return nil
}
