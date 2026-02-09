package routing

import (
	"context"
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

const otelSecretName = "otel-environment-variables"

type OTELEndpoint struct {
	Namespace string
	Endpoint  string
	Headers   string
	TLS       bool
}

func DiscoverOTELEndpoints(ctx context.Context, k8sClient client.Client) ([]OTELEndpoint, error) {
	if k8sClient == nil {
		return nil, nil
	}

	secretList := &corev1.SecretList{}
	if err := k8sClient.List(ctx, secretList); err != nil {
		return nil, fmt.Errorf("failed to list Secrets: %w", err)
	}

	endpoints := make([]OTELEndpoint, 0)

	for _, secret := range secretList.Items {
		if secret.Name != otelSecretName {
			continue
		}

		endpoint := parseOTELSecret(&secret)
		if endpoint == nil {
			continue
		}

		endpoint.Namespace = secret.Namespace
		endpoints = append(endpoints, *endpoint)

		log.Info("discovered OTEL endpoint", "namespace", secret.Namespace, "endpoint", endpoint.Endpoint)
	}

	return endpoints, nil
}

func parseOTELSecret(secret *corev1.Secret) *OTELEndpoint {
	endpointBytes, ok := secret.Data["OTEL_EXPORTER_OTLP_ENDPOINT"]
	if !ok {
		return nil
	}

	endpoint := strings.TrimSpace(string(endpointBytes))
	if endpoint == "" {
		return nil
	}

	result := &OTELEndpoint{
		Endpoint: endpoint,
		TLS:      strings.HasPrefix(endpoint, "https://"),
	}

	if headersBytes, ok := secret.Data["OTEL_EXPORTER_OTLP_HEADERS"]; ok {
		result.Headers = strings.TrimSpace(string(headersBytes))
	}

	return result
}
