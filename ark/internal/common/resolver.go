/* Copyright 2025. McKinsey & Company */

package common

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/secretscope"
)

type ValueSourceResolver struct {
	Client client.Client
}

func NewValueSourceResolver(k8sClient client.Client) *ValueSourceResolver {
	return &ValueSourceResolver{Client: k8sClient}
}

func (r *ValueSourceResolver) ResolveValueSource(ctx context.Context, valueSource arkv1alpha1.ValueSource, namespace string) (string, error) {
	if valueSource.Value != "" {
		return valueSource.Value, nil
	}

	if valueSource.ValueFrom == nil {
		return "", fmt.Errorf("value source must have either value or valueFrom specified")
	}

	if valueSource.ValueFrom.SecretKeyRef != nil {
		return r.resolveFromSecret(ctx, namespace, valueSource.ValueFrom.SecretKeyRef)
	}

	if valueSource.ValueFrom.ConfigMapKeyRef != nil {
		return r.resolveFromConfigMap(ctx, namespace, valueSource.ValueFrom.ConfigMapKeyRef)
	}

	if valueSource.ValueFrom.ServiceRef != nil {
		return r.resolveFromService(ctx, namespace, valueSource.ValueFrom.ServiceRef)
	}

	return "", fmt.Errorf("no valid valueFrom source specified")
}

func (r *ValueSourceResolver) resolveFromSecret(ctx context.Context, namespace string, secretRef *corev1.SecretKeySelector) (string, error) {
	if secretRef.Name == "" {
		return "", fmt.Errorf("secret name is required")
	}

	secret := &corev1.Secret{}
	err := r.Client.Get(ctx, types.NamespacedName{
		Name:      secretRef.Name,
		Namespace: namespace,
	}, secret)
	if err != nil {
		return "", fmt.Errorf("failed to get secret %s/%s: %w", namespace, secretRef.Name, err)
	}

	if err := secretscope.CheckResolvable(secret, secretscope.RejectPersonal); err != nil {
		return "", err
	}

	value, exists := secret.Data[secretRef.Key]
	if !exists {
		return "", fmt.Errorf("key %s not found in secret %s/%s", secretRef.Key, namespace, secretRef.Name)
	}

	return string(value), nil
}

func (r *ValueSourceResolver) resolveFromConfigMap(ctx context.Context, namespace string, configMapRef *corev1.ConfigMapKeySelector) (string, error) {
	if configMapRef.Name == "" {
		return "", fmt.Errorf("configMap name is required")
	}

	configMap := &corev1.ConfigMap{}
	err := r.Client.Get(ctx, types.NamespacedName{
		Name:      configMapRef.Name,
		Namespace: namespace,
	}, configMap)
	if err != nil {
		return "", fmt.Errorf("failed to get configMap %s/%s: %w", namespace, configMapRef.Name, err)
	}

	value, exists := configMap.Data[configMapRef.Key]
	if !exists {
		return "", fmt.Errorf("key %s not found in configMap %s/%s", configMapRef.Key, namespace, configMapRef.Name)
	}

	return value, nil
}

func (r *ValueSourceResolver) resolveFromService(ctx context.Context, namespace string, serviceRef *arkv1alpha1.ServiceReference) (string, error) {
	// Use ResolveServiceReference function
	return ResolveServiceReference(ctx, r.Client, serviceRef, namespace)
}
