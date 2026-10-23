/* Copyright 2025. McKinsey & Company */

package secretscope

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestIsPersonal(t *testing.T) {
	tests := []struct {
		name   string
		labels map[string]string
		want   bool
	}{
		{"personal", map[string]string{ResourceTypeLabel: SecretResourceType, ScopeLabel: "user-0123456789abcdef"}, true},
		{"shared", map[string]string{ResourceTypeLabel: SecretResourceType, ScopeLabel: "shared"}, false},
		{"no labels", nil, false},
		{"user scope without resource type", map[string]string{ScopeLabel: "user-0123456789abcdef"}, false},
		{"user scope on another resource type", map[string]string{ResourceTypeLabel: "configmap", ScopeLabel: "user-0123456789abcdef"}, false},
		{"short hash", map[string]string{ResourceTypeLabel: SecretResourceType, ScopeLabel: "user-0123456789abcde"}, false},
		{"long hash", map[string]string{ResourceTypeLabel: SecretResourceType, ScopeLabel: "user-0123456789abcdef0"}, false},
		{"uppercase hash", map[string]string{ResourceTypeLabel: SecretResourceType, ScopeLabel: "user-0123456789ABCDEF"}, false},
		{"trailing newline", map[string]string{ResourceTypeLabel: SecretResourceType, ScopeLabel: "user-0123456789abcdef\n"}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, IsPersonal(tt.labels))
		})
	}
}

func TestCheckResolvable(t *testing.T) {
	personal := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "u-0123456789abcdef-github",
			Namespace: "default",
			Labels:    map[string]string{ResourceTypeLabel: SecretResourceType, ScopeLabel: "user-0123456789abcdef"},
		},
		Data: map[string][]byte{"token": []byte("personal-token-value")},
	}
	shared := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "github",
			Namespace: "default",
			Labels:    map[string]string{ResourceTypeLabel: SecretResourceType, ScopeLabel: "shared"},
		},
	}
	unlabelled := &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "legacy", Namespace: "default"}}

	t.Run("rejects personal by default", func(t *testing.T) {
		err := CheckResolvable(personal, RejectPersonal)
		require.Error(t, err)
		require.True(t, errors.Is(err, ErrPersonalSecret))
		require.Contains(t, err.Error(), "default/u-0123456789abcdef-github")
		require.NotContains(t, err.Error(), "personal-token-value")
	})

	t.Run("zero value rejects personal", func(t *testing.T) {
		var access Access
		require.ErrorIs(t, CheckResolvable(personal, access), ErrPersonalSecret)
	})

	t.Run("allows personal when permitted", func(t *testing.T) {
		require.NoError(t, CheckResolvable(personal, AllowPersonal))
	})

	t.Run("allows shared and unlabelled", func(t *testing.T) {
		require.NoError(t, CheckResolvable(shared, RejectPersonal))
		require.NoError(t, CheckResolvable(unlabelled, RejectPersonal))
	})
}
