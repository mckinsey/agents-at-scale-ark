package crossns

import (
	"fmt"
	"reflect"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"mckinsey.com/ark/internal/annotations"
)

const (
	AllowedNamespacesAnnotation = annotations.ARKPrefix + "allowed-namespaces"
	allNamespaces               = "*"
)

func Allowed(target metav1.Object, fromNamespace string) bool {
	if target == nil || fromNamespace == "" {
		return false
	}
	if value := reflect.ValueOf(target); value.Kind() == reflect.Pointer && value.IsNil() {
		return false
	}
	if target.GetNamespace() == fromNamespace {
		return true
	}
	value, ok := target.GetAnnotations()[AllowedNamespacesAnnotation]
	if !ok {
		return false
	}
	for _, entry := range strings.Split(value, ",") {
		entry = strings.TrimSpace(entry)
		if entry == allNamespaces || entry == fromNamespace {
			return true
		}
	}
	return false
}

func DeniedError(kind, namespace, name, fromNamespace string) error {
	return fmt.Errorf(
		"cross-namespace reference to %s %s/%s is not allowed: the %s must list namespace %s in annotation %s",
		kind, namespace, name, kind, fromNamespace, AllowedNamespacesAnnotation,
	)
}
