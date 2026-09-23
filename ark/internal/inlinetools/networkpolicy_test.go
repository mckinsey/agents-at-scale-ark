/* Copyright 2025. McKinsey & Company */

package inlinetools

import (
	"maps"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/utils/ptr"

	"mckinsey.com/ark/internal/inlinetools/runner"
)

func runnerPolicy() *networkingv1.NetworkPolicy {
	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{Name: "runner-policy", Namespace: "tenant"},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{MatchLabels: map[string]string{"runner": "one"}},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeIngress, networkingv1.PolicyTypeEgress},
			Ingress: []networkingv1.NetworkPolicyIngressRule{{
				From: []networkingv1.NetworkPolicyPeer{{
					PodSelector:       &metav1.LabelSelector{MatchLabels: map[string]string{"app": ActivatorName}},
					NamespaceSelector: &metav1.LabelSelector{MatchLabels: map[string]string{corev1.LabelMetadataName: "ark-system"}},
				}},
				Ports: []networkingv1.NetworkPolicyPort{{Protocol: ptr.To(corev1.ProtocolTCP), Port: ptr.To(intstr.FromInt32(runner.Port))}},
			}},
		},
	}
}

func TestCheckRunnerNetworkPolicy(t *testing.T) {
	cases := []struct {
		name     string
		change   func(*networkingv1.NetworkPolicy)
		conflict bool
	}{
		{name: "owned runner boundary"},
		{name: "deny all", change: func(p *networkingv1.NetworkPolicy) { p.Spec.Ingress = nil }},
		{name: "other namespace", change: func(p *networkingv1.NetworkPolicy) {
			p.Namespace = "elsewhere"
			p.Spec.Egress = []networkingv1.NetworkPolicyEgressRule{{}}
		}},
		{name: "nonselecting allow all", change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.PodSelector.MatchLabels["runner"] = "two"
			p.Spec.Egress = []networkingv1.NetworkPolicyEgressRule{{}}
		}},
		{name: "empty selector selects runner", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.PodSelector = metav1.LabelSelector{}
			p.Spec.Egress = []networkingv1.NetworkPolicyEgressRule{{}}
		}},
		{name: "invalid runner selector", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.PodSelector.MatchExpressions = []metav1.LabelSelectorRequirement{{Key: "runner", Operator: "unknown"}}
		}},
		{name: "restricted egress is still egress", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Egress = []networkingv1.NetworkPolicyEgressRule{{To: []networkingv1.NetworkPolicyPeer{{PodSelector: &metav1.LabelSelector{}}}}}
		}},
		{name: "omitted policy types default ingress", change: func(p *networkingv1.NetworkPolicy) { p.Spec.PolicyTypes = nil }},
		{name: "omitted policy types default egress when rules exist", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.PolicyTypes = nil
			p.Spec.Egress = []networkingv1.NetworkPolicyEgressRule{{}}
		}},
		{name: "egress only deny", change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.PolicyTypes = []networkingv1.PolicyType{networkingv1.PolicyTypeEgress}
			p.Spec.Ingress = nil
		}},
		{name: "ingress only deny", change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.PolicyTypes = []networkingv1.PolicyType{networkingv1.PolicyTypeIngress}
			p.Spec.Ingress = nil
		}},
		{name: "empty ingress rule", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress = []networkingv1.NetworkPolicyIngressRule{{}}
		}},
		{name: "unrestricted peers", conflict: true, change: func(p *networkingv1.NetworkPolicy) { p.Spec.Ingress[0].From = nil }},
		{name: "empty peer", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].From = []networkingv1.NetworkPolicyPeer{{}}
		}},
		{name: "unrestricted ports", conflict: true, change: func(p *networkingv1.NetworkPolicy) { p.Spec.Ingress[0].Ports = nil }},
		{name: "protocol without port", conflict: true, change: func(p *networkingv1.NetworkPolicy) { p.Spec.Ingress[0].Ports[0].Port = nil }},
		{name: "TCP default", change: func(p *networkingv1.NetworkPolicy) { p.Spec.Ingress[0].Ports[0].Protocol = nil }},
		{name: "UDP", conflict: true, change: func(p *networkingv1.NetworkPolicy) { p.Spec.Ingress[0].Ports[0].Protocol = ptr.To(corev1.ProtocolUDP) }},
		{name: "SCTP", conflict: true, change: func(p *networkingv1.NetworkPolicy) { p.Spec.Ingress[0].Ports[0].Protocol = ptr.To(corev1.ProtocolSCTP) }},
		{name: "wrong port", conflict: true, change: func(p *networkingv1.NetworkPolicy) { p.Spec.Ingress[0].Ports[0].Port = ptr.To(intstr.FromInt32(443)) }},
		{name: "range widens port", conflict: true, change: func(p *networkingv1.NetworkPolicy) { p.Spec.Ingress[0].Ports[0].EndPort = ptr.To(int32(8081)) }},
		{name: "single port range", change: func(p *networkingv1.NetworkPolicy) { p.Spec.Ingress[0].Ports[0].EndPort = ptr.To(int32(runner.Port)) }},
		{name: "runner named port", change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].Ports[0].Port = ptr.To(intstr.FromString(runner.PortName))
		}},
		{name: "unknown named port", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].Ports[0].Port = ptr.To(intstr.FromString("other"))
		}},
		{name: "namespace alone", conflict: true, change: func(p *networkingv1.NetworkPolicy) { p.Spec.Ingress[0].From[0].PodSelector = nil }},
		{name: "all pods in activator namespace", conflict: true, change: func(p *networkingv1.NetworkPolicy) { p.Spec.Ingress[0].From[0].PodSelector = &metav1.LabelSelector{} }},
		{name: "same label in tenant namespace", conflict: true, change: func(p *networkingv1.NetworkPolicy) { p.Spec.Ingress[0].From[0].NamespaceSelector = nil }},
		{name: "all namespaces", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].From[0].NamespaceSelector = &metav1.LabelSelector{}
		}},
		{name: "wrong namespace", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].From[0].NamespaceSelector.MatchLabels[corev1.LabelMetadataName] = "elsewhere"
		}},
		{name: "wrong app", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].From[0].PodSelector.MatchLabels["app"] = "other"
		}},
		{name: "IPBlock", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].From = []networkingv1.NetworkPolicyPeer{{IPBlock: &networkingv1.IPBlock{CIDR: "10.0.0.0/24"}}}
		}},
		{name: "extra peer is an OR", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].From = append(p.Spec.Ingress[0].From, networkingv1.NetworkPolicyPeer{PodSelector: &metav1.LabelSelector{}})
		}},
		{name: "extra rule is an OR", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress = append(p.Spec.Ingress, networkingv1.NetworkPolicyIngressRule{})
		}},
		{name: "extra port is an OR", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].Ports = append(p.Spec.Ingress[0].Ports, networkingv1.NetworkPolicyPort{Port: ptr.To(intstr.FromInt32(443))})
		}},
		{name: "narrower activator selector", change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].From[0].PodSelector.MatchLabels["extra"] = "restriction"
		}},
		{name: "narrower namespace selector", change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].From[0].NamespaceSelector.MatchLabels["extra"] = "restriction"
		}},
		{name: "singleton In identity", change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].From[0].PodSelector = &metav1.LabelSelector{MatchExpressions: []metav1.LabelSelectorRequirement{{Key: "app", Operator: metav1.LabelSelectorOpIn, Values: []string{ActivatorName}}}}
		}},
		{name: "multiple In identities", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].From[0].PodSelector = &metav1.LabelSelector{MatchExpressions: []metav1.LabelSelectorRequirement{{Key: "app", Operator: metav1.LabelSelectorOpIn, Values: []string{ActivatorName, "other"}}}}
		}},
		{name: "Exists is not identity", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].From[0].PodSelector = &metav1.LabelSelector{MatchExpressions: []metav1.LabelSelectorRequirement{{Key: "app", Operator: metav1.LabelSelectorOpExists}}}
		}},
		{name: "invalid peer selector", conflict: true, change: func(p *networkingv1.NetworkPolicy) {
			p.Spec.Ingress[0].From[0].PodSelector.MatchExpressions = []metav1.LabelSelectorRequirement{{Key: "app", Operator: "unknown"}}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			policy := runnerPolicy()
			if tc.change != nil {
				tc.change(policy)
			}
			before := policy.DeepCopy()
			podLabels := map[string]string{"runner": "one"}
			activatorLabels := map[string]string{"app": ActivatorName}
			err := CheckRunnerNetworkPolicy(policy, "tenant", podLabels, "ark-system", activatorLabels)
			if tc.conflict {
				require.ErrorContains(t, err, "NetworkPolicy tenant/runner-policy")
				assert.ErrorContains(t, err, "an administrator must narrow it")
			} else {
				require.NoError(t, err)
			}
			assert.Equal(t, before, policy, "never rewrite another administrator's policy")
			assert.Equal(t, map[string]string{"runner": "one"}, podLabels)
			assert.Equal(t, map[string]string{"app": ActivatorName}, activatorLabels)
		})
	}
}

func TestRunnerPolicyConflictReevaluation(t *testing.T) {
	// The optional ark-tenant policy selects every pod, admits its namespace,
	// and allows all egress (charts/ark-tenant/templates/networkpolicy.yaml).
	policy := runnerPolicy()
	policy.Name = "tenant-ark-tenant-netpol"
	policy.Spec.PodSelector = metav1.LabelSelector{}
	policy.Spec.Ingress = []networkingv1.NetworkPolicyIngressRule{{From: []networkingv1.NetworkPolicyPeer{{PodSelector: &metav1.LabelSelector{}}}}}
	policy.Spec.Egress = []networkingv1.NetworkPolicyEgressRule{{}}
	podLabels := map[string]string{"runner": "one"}
	activatorLabels := map[string]string{"app": ActivatorName}
	check := func() error {
		return CheckRunnerNetworkPolicy(policy, "tenant", podLabels, "ark-system", activatorLabels)
	}

	require.ErrorContains(t, check(), "tenant/tenant-ark-tenant-netpol")
	policy.Spec.PodSelector.MatchExpressions = []metav1.LabelSelectorRequirement{{Key: "runner", Operator: metav1.LabelSelectorOpDoesNotExist}}
	require.NoError(t, check(), "narrowing the policy excludes runners")
	delete(podLabels, "runner")
	require.Error(t, check(), "changed pod labels must be evaluated, not cached")
	podLabels["runner"] = "one"
	require.NoError(t, check())
	policy.Spec.PodSelector.MatchExpressions[0].Operator = metav1.LabelSelectorOpExists
	require.Error(t, check(), "policy selector edits can restore the conflict")
	policy.Spec.PodSelector.MatchExpressions[0] = metav1.LabelSelectorRequirement{Key: "runner", Operator: metav1.LabelSelectorOpNotIn, Values: []string{"one"}}
	require.NoError(t, check())
	policy.Spec.PodSelector.MatchExpressions[0].Operator = metav1.LabelSelectorOpIn
	require.Error(t, check())

	policy.Spec = runnerPolicy().Spec
	require.NoError(t, check(), "restricting the rules also resolves a conflict")
	policy.Labels = maps.Clone(podLabels)
	policy.Labels["runner"] = "two"
	require.NoError(t, check(), "policy metadata labels do not select pods")
	policy.Spec.Ingress[0].From[0].NamespaceSelector = nil
	require.NoError(t, CheckRunnerNetworkPolicy(policy, "tenant", podLabels, "tenant", activatorLabels), "podSelector alone is safe when the activator shares the runner namespace")
	require.Error(t, CheckRunnerNetworkPolicy(policy, "tenant", podLabels, "tenant", nil), "an empty activator identity must not allow every pod")
}
