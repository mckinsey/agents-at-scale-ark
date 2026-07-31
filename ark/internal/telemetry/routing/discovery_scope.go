package routing

import (
	"os"

	"sigs.k8s.io/controller-runtime/pkg/client"
)

// discoveryNamespaceEnv names the env var that scopes broker/target discovery
// to a single namespace. A per-tenant completions pod is authorized by a
// namespaced Role/RoleBinding, which cannot satisfy a cluster-wide List; set
// this to the pod's own namespace so discovery lists only resources it can
// read. Left unset, discovery stays cluster-wide so the controller and the
// central ark-system install are unchanged.
const discoveryNamespaceEnv = "ARK_DISCOVERY_NAMESPACE"

// DiscoveryNamespace returns the namespace discovery is scoped to, or "" when
// discovery is cluster-wide. Callers that build their own informers or List
// calls use this so their scope matches the pod's RBAC.
func DiscoveryNamespace() string {
	return os.Getenv(discoveryNamespaceEnv)
}

// scopedListOptions returns the List options used by broker and target
// discovery. When ARK_DISCOVERY_NAMESPACE is set, the list is scoped to that
// namespace; otherwise it is cluster-wide (nil options).
func scopedListOptions() []client.ListOption {
	if ns := DiscoveryNamespace(); ns != "" {
		return []client.ListOption{client.InNamespace(ns)}
	}
	return nil
}
