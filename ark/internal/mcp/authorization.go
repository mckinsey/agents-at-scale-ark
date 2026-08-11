/* Copyright 2025. McKinsey & Company */

package mcp

import (
	"context"
	"fmt"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type AuthorizationMaterial struct {
	AccessToken string
	ExpiresAt   *metav1.Time
}

func ResolveAuthorizationMaterial(ctx context.Context, reader client.Reader, mcpServer *arkv1alpha1.MCPServer) (*AuthorizationMaterial, []string, error) {
	if mcpServer.Spec.Authorization == nil {
		return nil, nil, nil
	}

	log := logf.FromContext(ctx)
	ref := mcpServer.Spec.Authorization.TokenSecretRef
	material := &AuthorizationMaterial{}

	secret := &corev1.Secret{}
	nn := types.NamespacedName{Name: ref.Name, Namespace: mcpServer.Namespace}
	if err := reader.Get(ctx, nn, secret); err != nil {
		if errors.IsNotFound(err) {
			msg := fmt.Sprintf("Secret %q not found in namespace %q — referenced by spec.authorization.tokenSecretRef.name", ref.Name, mcpServer.Namespace)
			return material, []string{msg}, nil
		}
		return nil, nil, fmt.Errorf("failed to read authorization secret %s: %w", ref.Name, err)
	}

	warnings := missingOverriddenKeyWarnings(secret, ref)

	if raw, ok := secret.Data[ref.ResolvedAccessTokenKey()]; ok {
		material.AccessToken = strings.TrimSpace(string(raw))
	}

	expiresKey := ref.ResolvedExpiresAtKey()
	if raw, ok := secret.Data[expiresKey]; ok && len(raw) > 0 {
		parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(string(raw)))
		if err != nil {
			log.Info("unparseable expires_at in authorization secret, leaving status.authorization.expiresAt nil", "secret", ref.Name, "key", expiresKey, "error", err.Error())
		} else {
			t := metav1.NewTime(parsed)
			material.ExpiresAt = &t
		}
	}

	return material, warnings, nil
}

func missingOverriddenKeyWarnings(secret *corev1.Secret, ref arkv1alpha1.TokenSecretReference) []string {
	overrides := []struct {
		fieldName string
		value     string
		fallback  string
	}{
		{"accessTokenKey", ref.AccessTokenKey, arkv1alpha1.DefaultAccessTokenKey},
		{"refreshTokenKey", ref.RefreshTokenKey, arkv1alpha1.DefaultRefreshTokenKey},
		{"expiresAtKey", ref.ExpiresAtKey, arkv1alpha1.DefaultExpiresAtKey},
		{"clientIDKey", ref.ClientIDKey, arkv1alpha1.DefaultClientIDKey},
		{"clientSecretKey", ref.ClientSecretKey, arkv1alpha1.DefaultClientSecretKey},
	}

	warnings := make([]string, 0, len(overrides))
	for _, o := range overrides {
		if o.value == "" || o.value == o.fallback {
			continue
		}
		if _, ok := secret.Data[o.value]; ok {
			continue
		}
		warnings = append(warnings, fmt.Sprintf(
			"Secret %q has no key %q — spec.authorization.tokenSecretRef.%s was overridden",
			ref.Name, o.value, o.fieldName))
	}
	return warnings
}

func (m *AuthorizationMaterial) ApplyBearer(headers map[string]string) {
	if m == nil || m.AccessToken == "" {
		return
	}
	headers["Authorization"] = "Bearer " + m.AccessToken
}
