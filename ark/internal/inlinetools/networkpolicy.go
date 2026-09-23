/* Copyright 2025. McKinsey & Company */

package inlinetools

import (
	"fmt"
	"slices"

	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/util/intstr"

	"mckinsey.com/ark/internal/inlinetools/runner"
)

// CheckRunnerNetworkPolicy checks one policy against the runner's network boundary.
// Callers must supply every policy in the runner namespace and the actual pod
// labels, not policy metadata labels. It performs no API calls or traffic probes.
func CheckRunnerNetworkPolicy(policy *networkingv1.NetworkPolicy, namespace string, podLabels map[string]string, activatorNamespace string, activatorLabels map[string]string) error {
	if policy.Namespace != namespace {
		return nil
	}
	conflict := func(detail string) error {
		return fmt.Errorf("NetworkPolicy %s/%s %s; an administrator must narrow it to exclude inline runners or allow only activator ingress on TCP %d and no egress", policy.Namespace, policy.Name, detail, runner.Port)
	}
	selector, err := metav1.LabelSelectorAsSelector(&policy.Spec.PodSelector)
	if err != nil {
		return conflict("has an invalid pod selector")
	}
	if !selector.Matches(labels.Set(podLabels)) {
		return nil
	}

	types := policy.Spec.PolicyTypes
	if (len(types) == 0 || slices.Contains(types, networkingv1.PolicyTypeEgress)) && len(policy.Spec.Egress) > 0 {
		return conflict("allows runner egress")
	}
	if len(types) > 0 && !slices.Contains(types, networkingv1.PolicyTypeIngress) {
		return nil
	}
	for _, rule := range policy.Spec.Ingress {
		if len(rule.From) == 0 || len(rule.Ports) == 0 {
			return conflict("allows unrestricted runner ingress peers or ports")
		}
		for _, port := range rule.Ports {
			if !runnerPortOnly(port) {
				return conflict("allows ingress outside the runner TCP port")
			}
		}
		for _, peer := range rule.From {
			if peer.IPBlock != nil || !selectorRequiresLabels(peer.PodSelector, activatorLabels) {
				return conflict("allows ingress from workloads other than the activator")
			}
			if peer.NamespaceSelector == nil {
				if policy.Namespace != activatorNamespace {
					return conflict("allows ingress from outside the activator namespace")
				}
			} else if !selectorRequiresLabels(peer.NamespaceSelector, map[string]string{corev1.LabelMetadataName: activatorNamespace}) {
				return conflict("allows ingress from outside the activator namespace")
			}
		}
	}
	return nil
}

func runnerPortOnly(port networkingv1.NetworkPolicyPort) bool {
	if port.Protocol != nil && *port.Protocol != corev1.ProtocolTCP || port.Port == nil {
		return false
	}
	if port.Port.Type == intstr.String {
		return port.Port.StrVal == runner.PortName && port.EndPort == nil
	}
	return port.Port.IntVal == runner.Port && (port.EndPort == nil || *port.EndPort == runner.Port)
}

// Requiring each identity label proves containment without enumerating live pods.
// Selectors we cannot prove safe are conflicts, even if they currently match none.
func selectorRequiresLabels(selector *metav1.LabelSelector, required map[string]string) bool {
	if selector == nil || len(required) == 0 {
		return false
	}
	parsed, err := metav1.LabelSelectorAsSelector(selector)
	if err != nil {
		return false
	}
	for key, value := range required {
		if exact, ok := parsed.RequiresExactMatch(key); !ok || exact != value {
			return false
		}
	}
	return true
}
