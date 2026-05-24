/* Copyright 2025. McKinsey & Company */

package resolution

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// DefaultAccessTokenKey is the Secret key the controller and dispatch
// paths read for the OAuth access token when the user has not overridden
// spec.authorization.tokenSecretRef.accessTokenKey. It must stay aligned
// with the same default in the controller and the ark-sdk Python resolver
// so an MCPServer authored against any one of them works with all three.
const DefaultAccessTokenKey = "access_token"

// ResolveBearerToken returns the OAuth access token referenced by
// mcpServer.Spec.Authorization.TokenSecretRef, or "" when authorization
// is unset, the Secret is missing, or the configured key has no value.
//
// It is intentionally event-free — the MCPServerReconciler owns the
// "Secret missing / key absent" Warning surface for human-facing
// observability. This helper exists so dispatch-time MCP client
// construction in the built-in completions executor (and any future
// in-cluster path) shares the same Secret-read semantics as reconcile.
//
// Returns a non-nil error only for genuine API server failures; a
// missing Secret is treated as "no token yet, fall through to the
// existing 401 / discovery path".
func ResolveBearerToken(ctx context.Context, k8sClient client.Client, mcpServer *arkv1alpha1.MCPServer) (string, error) {
	if mcpServer == nil || mcpServer.Spec.Authorization == nil {
		return "", nil
	}

	ref := mcpServer.Spec.Authorization.TokenSecretRef
	if ref.Name == "" {
		return "", nil
	}

	secret := &corev1.Secret{}
	nn := types.NamespacedName{Name: ref.Name, Namespace: mcpServer.Namespace}
	if err := k8sClient.Get(ctx, nn, secret); err != nil {
		if errors.IsNotFound(err) {
			return "", nil
		}
		return "", fmt.Errorf("failed to read authorization secret %s: %w", ref.Name, err)
	}

	key := ref.AccessTokenKey
	if key == "" {
		key = DefaultAccessTokenKey
	}
	raw, ok := secret.Data[key]
	if !ok || len(raw) == 0 {
		return "", nil
	}
	return string(raw), nil
}
