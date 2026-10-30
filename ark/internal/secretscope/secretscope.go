/* Copyright 2025. McKinsey & Company */

package secretscope

import (
	"errors"
	"fmt"
	"regexp"

	corev1 "k8s.io/api/core/v1"
)

const (
	ResourceTypeLabel  = "ark.mckinsey.com/resource-type"
	ScopeLabel         = "ark.mckinsey.com/scope"
	SecretResourceType = "secret"
)

var userScope = regexp.MustCompile(`^user-[0-9a-f]{16}$`)

var ErrPersonalSecret = errors.New("personal secrets can only be used in the headers of a Query mcpserver override")

var ErrPersonalSecretSelector = errors.New("personal secrets can only be sent to one MCP server, selected by matchLabels ark.mckinsey.com/name and nothing else")

type Access int

const (
	RejectPersonal Access = iota
	AllowPersonal
)

func IsPersonal(labels map[string]string) bool {
	return labels[ResourceTypeLabel] == SecretResourceType && userScope.MatchString(labels[ScopeLabel])
}

func CheckResolvable(secret *corev1.Secret, access Access) error {
	if access == AllowPersonal || !IsPersonal(secret.GetLabels()) {
		return nil
	}
	return fmt.Errorf("secret %s/%s: %w", secret.GetNamespace(), secret.GetName(), ErrPersonalSecret)
}
