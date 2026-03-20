package validation

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/storage"
)

type ResourceLookup interface {
	GetResource(ctx context.Context, kind, namespace, name string) (runtime.Object, error)
	GetSecret(ctx context.Context, namespace, name string) (*corev1.Secret, error)
	GetConfigMap(ctx context.Context, namespace, name string) (*corev1.ConfigMap, error)
}

type WebhookLookup struct {
	Client client.Client
}

func (l *WebhookLookup) GetResource(ctx context.Context, kind, namespace, name string) (runtime.Object, error) {
	obj := newArkObject(kind)
	if obj == nil {
		return nil, fmt.Errorf("unknown resource kind %q", kind)
	}
	if err := l.Client.Get(ctx, types.NamespacedName{Name: name, Namespace: namespace}, obj); err != nil {
		return nil, err
	}
	return obj, nil
}

func (l *WebhookLookup) GetSecret(ctx context.Context, namespace, name string) (*corev1.Secret, error) {
	secret := &corev1.Secret{}
	if err := l.Client.Get(ctx, types.NamespacedName{Name: name, Namespace: namespace}, secret); err != nil {
		return nil, err
	}
	return secret, nil
}

func (l *WebhookLookup) GetConfigMap(ctx context.Context, namespace, name string) (*corev1.ConfigMap, error) {
	cm := &corev1.ConfigMap{}
	if err := l.Client.Get(ctx, types.NamespacedName{Name: name, Namespace: namespace}, cm); err != nil {
		return nil, err
	}
	return cm, nil
}

type StorageLookup struct {
	Backend   storage.Backend
	K8sClient client.Client
}

func (l *StorageLookup) GetResource(ctx context.Context, kind, namespace, name string) (runtime.Object, error) {
	return l.Backend.Get(ctx, kind, namespace, name)
}

func (l *StorageLookup) GetSecret(ctx context.Context, namespace, name string) (*corev1.Secret, error) {
	secret := &corev1.Secret{}
	if err := l.K8sClient.Get(ctx, types.NamespacedName{Name: name, Namespace: namespace}, secret); err != nil {
		return nil, err
	}
	return secret, nil
}

func (l *StorageLookup) GetConfigMap(ctx context.Context, namespace, name string) (*corev1.ConfigMap, error) {
	cm := &corev1.ConfigMap{}
	if err := l.K8sClient.Get(ctx, types.NamespacedName{Name: name, Namespace: namespace}, cm); err != nil {
		return nil, err
	}
	return cm, nil
}

func newArkObject(kind string) client.Object {
	switch kind {
	case "Agent":
		return &arkv1alpha1.Agent{}
	case "Model":
		return &arkv1alpha1.Model{}
	case "Query":
		return &arkv1alpha1.Query{}
	case "Team":
		return &arkv1alpha1.Team{}
	case "Tool":
		return &arkv1alpha1.Tool{}
	case "MCPServer":
		return &arkv1alpha1.MCPServer{}
	case "Memory":
		return &arkv1alpha1.Memory{}
	case "A2ATask":
		return &arkv1alpha1.A2ATask{}
	case "A2AServer":
		return &arkv1prealpha1.A2AServer{}
	case "ExecutionEngine":
		return &arkv1prealpha1.ExecutionEngine{}
	default:
		return nil
	}
}
