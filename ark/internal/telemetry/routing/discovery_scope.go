package routing

import (
	"os"
	"strings"

	"sigs.k8s.io/controller-runtime/pkg/client"
)

// discoveryNamespaceEnv names the env var that scopes broker/target discovery
// to a single namespace. A per-tenant completions pod is authorized by a
// namespaced Role/RoleBinding, which cannot satisfy a cluster-wide List; set
// this to the pod's own namespace so discovery lists only resources it can
// read. Left unset, discovery stays cluster-wide so the controller and the
// central ark-system install are unchanged.
const discoveryNamespaceEnv = "ARK_DISCOVERY_NAMESPACE"

// watchNamespacesEnv names the controller's namespaced-mode env var
// (comma-separated). When the controller runs namespace-scoped its
// ServiceAccount only holds per-namespace RBAC, so discovery must list each
// watched namespace instead of the cluster.
const watchNamespacesEnv = "ARK_WATCH_NAMESPACES"

// DiscoveryNamespace returns the namespace discovery is scoped to, or "" when
// discovery is cluster-wide. Callers that build their own informers or List
// calls use this so their scope matches the pod's RBAC.
func DiscoveryNamespace() string {
	return os.Getenv(discoveryNamespaceEnv)
}

// discoveryNamespaces returns the namespaces broker/target discovery must list,
// or nil for a cluster-wide list. ARK_DISCOVERY_NAMESPACE pins discovery to a
// single namespace; otherwise ARK_WATCH_NAMESPACES scopes it to the controller's
// watched set. Both unset means cluster-wide.
func discoveryNamespaces() []string {
	if ns := strings.TrimSpace(os.Getenv(discoveryNamespaceEnv)); ns != "" {
		return []string{ns}
	}
	var out []string
	for _, ns := range strings.Split(os.Getenv(watchNamespacesEnv), ",") {
		if ns = strings.TrimSpace(ns); ns != "" {
			out = append(out, ns)
		}
	}
	return out
}

// scopedListOptionSets returns one set of List options per namespace discovery
// must read, or a single nil set for a cluster-wide list. Callers issue one List
// per set so a namespace-scoped ServiceAccount never attempts a forbidden
// cluster-wide List.
func scopedListOptionSets() [][]client.ListOption {
	nss := discoveryNamespaces()
	if len(nss) == 0 {
		return [][]client.ListOption{nil}
	}
	sets := make([][]client.ListOption, 0, len(nss))
	for _, ns := range nss {
		sets = append(sets, []client.ListOption{client.InNamespace(ns)})
	}
	return sets
}
