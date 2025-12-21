package routing

import (
	"context"
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

var log = logf.Log.WithName("telemetry.routing")

const brokerConfigName = "ark-config-broker"

type BrokerEndpoint struct {
	Namespace string
	Endpoint  string
}

type BrokerConfig struct {
	Enabled    string
	ServiceRef ServiceRef
}

type ServiceRef struct {
	Name string
	Port string
}

func DiscoverBrokerEndpoints(ctx context.Context, k8sClient client.Client) ([]BrokerEndpoint, error) {
	if k8sClient == nil {
		return nil, nil
	}

	cmList := &corev1.ConfigMapList{}
	if err := k8sClient.List(ctx, cmList); err != nil {
		return nil, fmt.Errorf("failed to list ConfigMaps: %w", err)
	}

	endpoints := make([]BrokerEndpoint, 0, len(cmList.Items))

	for _, cm := range cmList.Items {
		if cm.Name != brokerConfigName {
			continue
		}

		config, err := parseBrokerConfig(&cm)
		if err != nil {
			log.Error(err, "failed to parse broker config", "namespace", cm.Namespace)
			continue
		}

		if config.Enabled != "true" {
			continue
		}

		endpoint, err := buildEndpoint(cm.Namespace, config.ServiceRef)
		if err != nil {
			log.Error(err, "failed to build endpoint", "namespace", cm.Namespace)
			continue
		}

		endpoints = append(endpoints, BrokerEndpoint{
			Namespace: cm.Namespace,
			Endpoint:  endpoint,
		})

		log.Info("discovered broker endpoint", "namespace", cm.Namespace, "endpoint", endpoint)
	}

	return endpoints, nil
}

func GetBrokerConfig(ctx context.Context, k8sClient client.Client, namespace string) (*BrokerConfig, error) {
	if k8sClient == nil {
		return nil, nil
	}

	cm := &corev1.ConfigMap{}
	err := k8sClient.Get(ctx, types.NamespacedName{
		Name:      brokerConfigName,
		Namespace: namespace,
	}, cm)
	if err != nil {
		if client.IgnoreNotFound(err) == nil {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get ConfigMap %s/%s: %w", namespace, brokerConfigName, err)
	}

	return parseBrokerConfig(cm)
}

func parseBrokerConfig(cm *corev1.ConfigMap) (*BrokerConfig, error) {
	config := &BrokerConfig{}

	if enabled, ok := cm.Data["enabled"]; ok {
		config.Enabled = enabled
	}

	if serviceRefStr, ok := cm.Data["serviceRef"]; ok {
		serviceRef, err := parseServiceRef(serviceRefStr)
		if err != nil {
			return nil, fmt.Errorf("failed to parse serviceRef: %w", err)
		}
		config.ServiceRef = serviceRef
	}

	return config, nil
}

func parseServiceRef(data string) (ServiceRef, error) {
	ref := ServiceRef{}
	lines := strings.Split(strings.TrimSpace(data), "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.Trim(strings.TrimSpace(parts[1]), "\"")

		switch key {
		case "name":
			ref.Name = value
		case "port":
			ref.Port = value
		}
	}

	if ref.Name == "" {
		return ref, fmt.Errorf("serviceRef.name is required")
	}

	return ref, nil
}

func buildEndpoint(namespace string, serviceRef ServiceRef) (string, error) {
	if serviceRef.Name == "" {
		return "", fmt.Errorf("serviceRef.name is empty")
	}

	port := serviceRef.Port
	switch port {
	case "", "http":
		port = "80"
	case "https":
		port = "443"
	}

	endpoint := fmt.Sprintf("http://%s.%s.svc.cluster.local:%s",
		serviceRef.Name, namespace, port)

	return endpoint, nil
}
