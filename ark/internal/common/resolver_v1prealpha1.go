/* Copyright 2025. McKinsey & Company */

package common

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/secretscope"
)

type ValueSourceResolverV1PreAlpha1 struct {
	Client client.Client
}

func NewValueSourceResolverV1PreAlpha1(k8sClient client.Client) *ValueSourceResolverV1PreAlpha1 {
	return &ValueSourceResolverV1PreAlpha1{Client: k8sClient}
}

func (r *ValueSourceResolverV1PreAlpha1) ResolveValueSource(ctx context.Context, valueSource arkv1prealpha1.ValueSource, namespace string) (string, error) {
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

func (r *ValueSourceResolverV1PreAlpha1) resolveFromSecret(ctx context.Context, namespace string, secretRef *corev1.SecretKeySelector) (string, error) {
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

func (r *ValueSourceResolverV1PreAlpha1) resolveFromConfigMap(ctx context.Context, namespace string, configMapRef *corev1.ConfigMapKeySelector) (string, error) {
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

func (r *ValueSourceResolverV1PreAlpha1) resolveFromService(ctx context.Context, namespace string, serviceRef *arkv1prealpha1.ServiceReference) (string, error) {
	// Convert v1prealpha1.ServiceReference to v1alpha1.ServiceReference for reuse
	v1alpha1ServiceRef := &arkv1alpha1.ServiceReference{
		Name:      serviceRef.Name,
		Namespace: serviceRef.Namespace,
		Port:      serviceRef.Port,
		Path:      serviceRef.Path,
	}
	return ResolveServiceReference(ctx, r.Client, v1alpha1ServiceRef, namespace)
}
