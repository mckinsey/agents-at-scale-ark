//nolint:unparam
package validation

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

type mockLookup struct {
	resources  map[string]runtime.Object
	secrets    map[string]*corev1.Secret
	configMaps map[string]*corev1.ConfigMap
}

func newMockLookup() *mockLookup {
	return &mockLookup{
		resources:  make(map[string]runtime.Object),
		secrets:    make(map[string]*corev1.Secret),
		configMaps: make(map[string]*corev1.ConfigMap),
	}
}

func (m *mockLookup) key(namespace, name string) string {
	return namespace + "/" + name
}

func (m *mockLookup) GetResource(_ context.Context, kind, namespace, name string) (runtime.Object, error) {
	obj, ok := m.resources[kind+"/"+m.key(namespace, name)]
	if !ok {
		return nil, fmt.Errorf("not found")
	}
	return obj, nil
}

func (m *mockLookup) GetSecret(_ context.Context, namespace, name string) (*corev1.Secret, error) {
	s, ok := m.secrets[m.key(namespace, name)]
	if !ok {
		return nil, fmt.Errorf("not found")
	}
	return s, nil
}

func (m *mockLookup) GetConfigMap(_ context.Context, namespace, name string) (*corev1.ConfigMap, error) {
	cm, ok := m.configMaps[m.key(namespace, name)]
	if !ok {
		return nil, fmt.Errorf("not found")
	}
	return cm, nil
}

func (m *mockLookup) addResource(kind, namespace, name string, obj runtime.Object) {
	m.resources[kind+"/"+m.key(namespace, name)] = obj
}

func (m *mockLookup) addSecret(namespace, name string, data map[string][]byte) {
	m.secrets[m.key(namespace, name)] = &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Data:       data,
	}
}

func (m *mockLookup) addConfigMap(namespace, name string, data map[string]string) {
	m.configMaps[m.key(namespace, name)] = &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: namespace},
		Data:       data,
	}
}
