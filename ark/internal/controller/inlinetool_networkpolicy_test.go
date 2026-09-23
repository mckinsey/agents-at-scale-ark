/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"testing"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/utils/ptr"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/cache"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"
	"sigs.k8s.io/controller-runtime/pkg/event"
	metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools"
	"mckinsey.com/ark/internal/inlinetools/runner"
)

func tenantAllowAll(namespace string) *networkingv1.NetworkPolicy {
	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{Name: "tenant-ark-tenant-netpol", Namespace: namespace},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{},
			PolicyTypes: []networkingv1.PolicyType{networkingv1.PolicyTypeIngress, networkingv1.PolicyTypeEgress},
			Ingress:     []networkingv1.NetworkPolicyIngressRule{{From: []networkingv1.NetworkPolicyPeer{{PodSelector: &metav1.LabelSelector{}}}}},
			Egress:      []networkingv1.NetworkPolicyEgressRule{{}},
		},
	}
}

func runnerReplicaSetAndPod(deployment *appsv1.Deployment) (*appsv1.ReplicaSet, *corev1.Pod) {
	rs := &appsv1.ReplicaSet{
		ObjectMeta: metav1.ObjectMeta{
			Name: deployment.Name + "-revision", Namespace: deployment.Namespace, UID: types.UID(uuidFor("revision")),
			OwnerReferences: []metav1.OwnerReference{*metav1.NewControllerRef(deployment, appsv1.SchemeGroupVersion.WithKind("Deployment"))},
		},
		Spec: appsv1.ReplicaSetSpec{Replicas: ptr.To(int32(0)), Selector: deployment.Spec.Selector.DeepCopy(), Template: *deployment.Spec.Template.DeepCopy()},
	}
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{
		Name: deployment.Name + "-pod", Namespace: deployment.Namespace,
		Labels:          deployment.Spec.Template.DeepCopy().Labels,
		OwnerReferences: []metav1.OwnerReference{*metav1.NewControllerRef(rs, appsv1.SchemeGroupVersion.WithKind("ReplicaSet"))},
	}, Spec: *deployment.Spec.Template.Spec.DeepCopy()}
	return rs, pod
}

func TestInlineNetworkPolicyConflictAndRecovery(t *testing.T) {
	ctx := context.Background()
	tool := newInlineTool("policy-conflict")
	r := newInlineStatusReconciler(t, tool, activatorDeployment(1))
	result, available := reconcileInlineTool(t, r, tool)
	require.Equal(t, arkv1alpha1.ToolStateReady, available.Status.State)
	assert.Equal(t, inlineActivatorRetry, result.RequeueAfter)
	_, unchanged := reconcileInlineTool(t, r, tool)
	assert.Equal(t, available.ResourceVersion, unchanged.ResourceVersion, "unchanged status must not create a reconciliation loop")

	policy := tenantAllowAll(tool.Namespace)
	require.NoError(t, r.Create(ctx, policy))
	before := policy.DeepCopy()
	result, pending := reconcileInlineTool(t, r, tool)
	condition := availableCondition(t, pending)
	assert.Equal(t, metav1.ConditionFalse, condition.Status)
	assert.Equal(t, arkv1alpha1.ToolReasonConflictingPolicy, condition.Reason)
	assert.Equal(t, arkv1alpha1.ToolStatePending, pending.Status.State)
	assert.Contains(t, condition.Message, tool.Namespace+"/"+policy.Name)
	assert.Contains(t, condition.Message, "administrator must narrow")
	assert.Empty(t, pending.Status.ResolvedAddress)
	assert.Equal(t, inlineActivatorRetry, result.RequeueAfter)
	require.NoError(t, r.Get(ctx, client.ObjectKeyFromObject(policy), policy))
	assert.Equal(t, before, policy, "tenant policies are never rewritten")

	policy.Spec.PodSelector.MatchExpressions = []metav1.LabelSelectorRequirement{{Key: LabelInlineToolUID, Operator: metav1.LabelSelectorOpDoesNotExist}}
	require.NoError(t, r.Update(ctx, policy))
	_, recovered := reconcileInlineTool(t, r, tool)
	assert.Equal(t, arkv1alpha1.ToolReasonAvailable, availableCondition(t, recovered).Reason)
	assert.NotEmpty(t, recovered.Status.ResolvedAddress)

	policy.Spec.PodSelector = metav1.LabelSelector{}
	policy.Spec.Egress = nil
	require.NoError(t, r.Update(ctx, policy))
	_, pending = reconcileInlineTool(t, r, tool)
	assert.Equal(t, arkv1alpha1.ToolReasonConflictingPolicy, availableCondition(t, pending).Reason, "broad ingress alone conflicts")
	require.NoError(t, r.Delete(ctx, policy))
	_, recovered = reconcileInlineTool(t, r, tool)
	assert.Equal(t, arkv1alpha1.ToolStateReady, recovered.Status.State)

	owned := inlineNetworkPolicy(tool, activatorSelector(), activatorNamespace())
	require.NoError(t, r.Get(ctx, client.ObjectKeyFromObject(owned), owned))
	owned.Spec.Egress = []networkingv1.NetworkPolicyEgressRule{{}}
	require.NoError(t, r.Update(ctx, owned))
	_, recovered = reconcileInlineTool(t, r, tool)
	require.NoError(t, r.Get(ctx, client.ObjectKeyFromObject(owned), owned))
	assert.Empty(t, owned.Spec.Egress, "owned policy drift is repaired")
	assert.Equal(t, arkv1alpha1.ToolStateReady, recovered.Status.State)
}

func TestInlineNetworkPolicyChecksLivePodLabels(t *testing.T) {
	ctx := context.Background()
	tool := newInlineTool("pod-labels")
	r := newInlineStatusReconciler(t, tool, activatorDeployment(1))
	_, _ = reconcileInlineTool(t, r, tool)
	deployment := inlineGetDeployment(t, r, inlineChildNames(tool.Name).Runner)
	deployment.UID = types.UID(uuidFor("deployment"))
	require.NoError(t, r.Update(ctx, deployment))
	rs, pod := runnerReplicaSetAndPod(deployment)
	pod.Labels["tenant-access"] = "all"
	require.NoError(t, r.Create(ctx, rs))
	require.NoError(t, r.Create(ctx, pod))
	policy := tenantAllowAll(tool.Namespace)
	policy.Spec.PodSelector.MatchLabels = map[string]string{"tenant-access": "all"}
	require.NoError(t, r.Create(ctx, policy))
	_, pending := reconcileInlineTool(t, r, tool)
	assert.Equal(t, arkv1alpha1.ToolReasonConflictingPolicy, availableCondition(t, pending).Reason)
	delete(pod.Labels, "tenant-access")
	require.NoError(t, r.Update(ctx, pod))
	_, recovered := reconcileInlineTool(t, r, tool)
	assert.Equal(t, arkv1alpha1.ToolStateReady, recovered.Status.State)

	delete(pod.Labels, LabelInlineToolUID)
	require.NoError(t, r.Update(ctx, pod))
	_, err := r.Reconcile(ctx, ctrl.Request{NamespacedName: client.ObjectKeyFromObject(tool)})
	require.ErrorContains(t, err, "no longer matches its owned NetworkPolicy")
	require.NoError(t, r.Get(ctx, client.ObjectKeyFromObject(tool), tool))
	assert.Empty(t, tool.Status.ResolvedAddress)
	assert.Equal(t, arkv1alpha1.ToolReasonProvisioningFailed, availableCondition(t, tool).Reason)

	pod.OwnerReferences = nil
	require.NoError(t, r.Update(ctx, pod))
	_, recovered = reconcileInlineTool(t, r, tool)
	assert.Equal(t, arkv1alpha1.ToolStateReady, recovered.Status.State, "unrelated pods do not change the runner verdict")
}

func TestInlineNetworkPolicyReadErrorsFailClosed(t *testing.T) {
	for _, kind := range []string{"policies", "replicasets", "pods"} {
		t.Run(kind, func(t *testing.T) {
			tool := newInlineTool("unreadable")
			r := newInlineStatusReconciler(t, tool, activatorDeployment(1))
			_, _ = reconcileInlineTool(t, r, tool)
			r.Client = interceptor.NewClient(r.Client.(client.WithWatch), interceptor.Funcs{List: func(ctx context.Context, c client.WithWatch, list client.ObjectList, opts ...client.ListOption) error {
				fail := false
				switch list.(type) {
				case *networkingv1.NetworkPolicyList:
					fail = kind == "policies"
				case *appsv1.ReplicaSetList:
					fail = kind == "replicasets"
				case *corev1.PodList:
					fail = kind == "pods"
				}
				if fail {
					return errors.New("read denied")
				}
				return c.List(ctx, list, opts...)
			}})
			_, err := r.Reconcile(context.Background(), ctrl.Request{NamespacedName: client.ObjectKeyFromObject(tool)})
			require.ErrorContains(t, err, "read denied")
			require.NoError(t, r.Get(context.Background(), client.ObjectKeyFromObject(tool), tool))
			assert.Empty(t, tool.Status.ResolvedAddress)
			assert.Equal(t, arkv1alpha1.ToolReasonProvisioningFailed, availableCondition(t, tool).Reason)
		})
	}
}

func TestInlineNetworkWatchMapping(t *testing.T) {
	tool := newInlineTool("selected")
	other := newInlineTool("other-namespace")
	other.Namespace = "elsewhere"
	http := newInlineTool("http")
	http.Spec.Type = arkv1alpha1.ToolTypeHTTP
	r := newInlineStatusReconciler(t, tool, other, http)
	requests := r.inlineToolsInNamespace(context.Background(), tenantAllowAll(tool.Namespace))
	require.Len(t, requests, 1)
	assert.Equal(t, client.ObjectKeyFromObject(tool), requests[0].NamespacedName)
	pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Labels: inlineLabels(tool)}}
	changed := pod.DeepCopy()
	changed.Labels["tenant-access"] = "all"
	filter := inlineNetworkLabelsChanged()
	assert.True(t, filter.Update(event.UpdateEvent{ObjectOld: pod, ObjectNew: changed}))
	assert.True(t, filter.Update(event.UpdateEvent{ObjectOld: changed, ObjectNew: pod}), "removed labels matter too")
	changed = pod.DeepCopy()
	changed.Status.Phase = corev1.PodRunning
	assert.False(t, filter.Update(event.UpdateEvent{ObjectOld: pod, ObjectNew: changed}))
	changed.OwnerReferences = []metav1.OwnerReference{{UID: "another-owner"}}
	assert.True(t, filter.Update(event.UpdateEvent{ObjectOld: pod, ObjectNew: changed}))
	assert.True(t, filter.Create(event.CreateEvent{Object: pod}))
	assert.True(t, filter.Delete(event.DeleteEvent{Object: pod}))
}

// Run explicitly against the existing enforcing-CNI test profile:
// ARK_INLINE_NETWORK_TEST_CONTEXT=colima-inline-tools-p3 go test ./internal/controller -run TestInlineNetworkPolicyBoundary -count=1
func TestInlineNetworkPolicyBoundary(t *testing.T) {
	cluster := os.Getenv("ARK_INLINE_NETWORK_TEST_CONTEXT")
	if cluster == "" {
		t.Skip("set ARK_INLINE_NETWORK_TEST_CONTEXT to an isolated cluster with an enforcing CNI")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	cfg, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(clientcmd.NewDefaultClientConfigLoadingRules(), &clientcmd.ConfigOverrides{CurrentContext: cluster}).ClientConfig()
	require.NoError(t, err)
	c, err := client.New(cfg, client.Options{Scheme: newInlineScheme()})
	require.NoError(t, err)
	newNamespace := func() string {
		ns := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{GenerateName: "inline-boundary-"}}
		require.NoError(t, c.Create(ctx, ns))
		t.Cleanup(func() { assert.NoError(t, c.Delete(context.Background(), ns)) })
		return ns.Name
	}
	namespace, activatorNamespace := newNamespace(), newNamespace()
	tool := newInlineTool("boundary")
	tool.Namespace = namespace
	createPod := func(name, ns, image string, labels map[string]string, command ...string) *corev1.Pod {
		pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns, Labels: labels}, Spec: corev1.PodSpec{
			AutomountServiceAccountToken: ptr.To(false), RestartPolicy: corev1.RestartPolicyNever,
			Containers: []corev1.Container{{Name: "check", Image: image, Command: command}},
		}}
		require.NoError(t, c.Create(ctx, pod))
		return pod
	}
	server := createPod("runner", namespace, "node:22-alpine", inlineLabels(tool), "node", "-e", "require('node:http').createServer((req,res)=>res.end('ok')).listen(8080)")
	allowed := createPod("activator", activatorNamespace, "curlimages/curl:8.11.1", activatorSelector(), "sleep", "600")
	denied := createPod("unrelated", namespace, "curlimages/curl:8.11.1", nil, "sleep", "600")
	kubectl := func(args ...string) ([]byte, error) {
		commandCtx, stop := context.WithTimeout(ctx, 100*time.Second)
		defer stop()
		return exec.CommandContext(commandCtx, "kubectl", append([]string{"--context", cluster}, args...)...).CombinedOutput()
	}
	for _, pod := range []*corev1.Pod{server, allowed, denied} {
		out, err := kubectl("-n", pod.Namespace, "wait", "--for=condition=Ready", "pod/"+pod.Name, "--timeout=90s")
		require.NoError(t, err, "%s", out)
		require.NoError(t, c.Get(ctx, client.ObjectKeyFromObject(pod), pod))
	}
	var dns corev1.PodList
	require.NoError(t, c.List(ctx, &dns, client.InNamespace("kube-system"), client.MatchingLabels{"k8s-app": "kube-dns"}))
	require.NotEmpty(t, dns.Items)
	target := dns.Items[0].Status.PodIP
	require.NotEmpty(t, target)
	incoming := func(pod *corev1.Pod) error {
		_, err := kubectl("-n", pod.Namespace, "exec", pod.Name, "--", "curl", "--silent", "--show-error", "--fail", "--connect-timeout", "2", "--max-time", "3", "http://"+server.Status.PodIP+":8080")
		return err
	}
	outgoing := func() error {
		_, err := kubectl("-n", namespace, "exec", server.Name, "--", "node", "-e", "fetch('http://"+target+":8080/health', {signal:AbortSignal.timeout(2000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(e=>process.exit(e.name==='TimeoutError'?28:1))")
		return err
	}
	isTimeout := func(err error) bool {
		var exit *exec.ExitError
		return errors.As(err, &exit) && exit.ExitCode() == 28
	}
	assertBoundary := func(blocked bool) {
		t.Helper()
		require.Eventually(t, func() bool { return incoming(allowed) == nil }, 30*time.Second, time.Second, "activator must reach runner")
		require.Eventually(t, func() bool {
			ingress, egress := incoming(denied), outgoing()
			if blocked {
				return isTimeout(ingress) && isTimeout(egress)
			}
			return ingress == nil && egress == nil
		}, 30*time.Second, time.Second, "unexpected boundary state; blocked=%v", blocked)
	}
	assertBoundary(false)
	policy := inlineNetworkPolicy(tool, activatorSelector(), activatorNamespace)
	require.NoError(t, c.Create(ctx, policy))
	assertBoundary(true)
	wide := tenantAllowAll(namespace)
	require.NoError(t, c.Create(ctx, wide))
	assertBoundary(false)
	require.Error(t, inlinetools.CheckRunnerNetworkPolicy(wide, namespace, server.Labels, activatorNamespace, activatorSelector()))
	wide.Spec.PodSelector.MatchExpressions = []metav1.LabelSelectorRequirement{{Key: LabelInlineToolUID, Operator: metav1.LabelSelectorOpDoesNotExist}}
	require.NoError(t, c.Update(ctx, wide))
	assertBoundary(true)
	t.Log("Calico boundary: activator-only ingress and denied egress; tenant allow-all defeats both; narrowing restores both")
}

var _ = Describe("Inline network policy watches", func() {
	It("withdraws and recovers endpoints after policy and live pod label changes", func() {
		GinkgoT().Setenv(inlinetools.EnabledEnvVar, "true")
		GinkgoT().Setenv(runner.EnvImageRepository, "ghcr.io/example/ark-inline-runner")
		GinkgoT().Setenv(runner.EnvImageTag, "test")
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		ns := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{GenerateName: "inline-net-"}}
		Expect(k8sClient.Create(ctx, ns)).To(Succeed())
		GinkgoT().Setenv(EnvActivatorNamespace, ns.Name)
		mgr, err := ctrl.NewManager(cfg, ctrl.Options{
			Scheme: k8sClient.Scheme(), Metrics: metricsserver.Options{BindAddress: "0"},
			Cache: cache.Options{DefaultNamespaces: map[string]cache.Config{ns.Name: {}}},
		})
		Expect(err).NotTo(HaveOccurred())
		r := &ToolReconciler{Client: mgr.GetClient(), Scheme: mgr.GetScheme()}
		Expect(r.SetupWithManager(mgr)).To(Succeed())
		done := make(chan error, 1)
		go func() { done <- mgr.Start(ctx) }()
		DeferCleanup(func() {
			cancel()
			Eventually(done, 5*time.Second).Should(Receive(Succeed()))
		})
		syncCtx, stopSync := context.WithTimeout(ctx, 10*time.Second)
		defer stopSync()
		Expect(mgr.GetCache().WaitForCacheSync(syncCtx)).To(BeTrue())

		tool := newInlineTool("watched")
		tool.Namespace, tool.UID = ns.Name, ""
		activator, err := inlineDeployment(tool, "test")
		Expect(err).NotTo(HaveOccurred())
		activator.Name = inlinetools.ActivatorName
		Expect(k8sClient.Create(ctx, activator)).To(Succeed())
		activator.Status = appsv1.DeploymentStatus{Replicas: 1, ReadyReplicas: 1, AvailableReplicas: 1}
		Expect(k8sClient.Status().Update(ctx, activator)).To(Succeed())
		Expect(k8sClient.Create(ctx, tool)).To(Succeed())
		key := client.ObjectKeyFromObject(tool)
		assertReason := func(reason string) {
			Eventually(func(g Gomega) {
				current := &arkv1alpha1.Tool{}
				g.Expect(k8sClient.Get(ctx, key, current)).To(Succeed())
				condition := meta.FindStatusCondition(current.Status.Conditions, arkv1alpha1.ToolConditionAvailable)
				g.Expect(condition).NotTo(BeNil())
				g.Expect(condition.Reason).To(Equal(reason))
				g.Expect(condition.ObservedGeneration).To(Equal(current.Generation))
				if reason == arkv1alpha1.ToolReasonAvailable {
					g.Expect(current.Status.ResolvedAddress).NotTo(BeEmpty())
				} else {
					g.Expect(current.Status.ResolvedAddress).To(BeEmpty())
				}
			}, 10*time.Second, 50*time.Millisecond).Should(Succeed())
		}
		assertReason(arkv1alpha1.ToolReasonAvailable)
		policy := tenantAllowAll(ns.Name)
		Expect(k8sClient.Create(ctx, policy)).To(Succeed())
		assertReason(arkv1alpha1.ToolReasonConflictingPolicy)
		policy.Spec.PodSelector.MatchLabels = map[string]string{"tenant-access": "all"}
		Expect(k8sClient.Update(ctx, policy)).To(Succeed())
		assertReason(arkv1alpha1.ToolReasonAvailable)

		deployment := &appsv1.Deployment{}
		Expect(k8sClient.Get(ctx, client.ObjectKey{Namespace: ns.Name, Name: inlineChildNames(tool.Name).Runner}, deployment)).To(Succeed())
		rs, pod := runnerReplicaSetAndPod(deployment)
		rs.UID = ""
		Expect(k8sClient.Create(ctx, rs)).To(Succeed())
		pod.OwnerReferences = []metav1.OwnerReference{*metav1.NewControllerRef(rs, appsv1.SchemeGroupVersion.WithKind("ReplicaSet"))}
		pod.Labels["tenant-access"] = "all"
		Expect(k8sClient.Create(ctx, pod)).To(Succeed())
		assertReason(arkv1alpha1.ToolReasonConflictingPolicy)
		delete(pod.Labels, "tenant-access")
		Expect(k8sClient.Update(ctx, pod)).To(Succeed())
		assertReason(arkv1alpha1.ToolReasonAvailable)
		pod.Labels["tenant-access"] = "all"
		Expect(k8sClient.Update(ctx, pod)).To(Succeed())
		assertReason(arkv1alpha1.ToolReasonConflictingPolicy)
		Expect(k8sClient.Delete(ctx, policy)).To(Succeed())
		assertReason(arkv1alpha1.ToolReasonAvailable)
	})
})
