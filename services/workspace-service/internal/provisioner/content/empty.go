package content

import (
	"go.uber.org/zap"
)

type EmptyProvisioner struct {
	logger *zap.Logger
}

func NewEmptyProvisioner(logger *zap.Logger) *EmptyProvisioner {
	return &EmptyProvisioner{logger: logger}
}

func (e *EmptyProvisioner) Provision(params ProvisionParams) error {
	e.logger.Info("empty workspace provisioned", zap.String("path", params.TargetPath))
	return nil
}
