/* Copyright 2025. McKinsey & Company */

package activator

import (
	"context"
	"fmt"
	"slices"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	autoscalingv1 "k8s.io/api/autoscaling/v1"
	corev1 "k8s.io/api/core/v1"
	discoveryv1 "k8s.io/api/discovery/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/validation"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools"
)

type target struct {
	tool       *arkv1alpha1.Tool
	deployment *appsv1.Deployment
	service    *corev1.Service
	address    string
}

func (a *Activator) resolve(ctx context.Context, key types.NamespacedName, uid types.UID, calledName string) (*target, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if !inlinetools.Enabled() || !slices.Contains(a.namespaces, key.Namespace) || len(validation.IsDNS1123Subdomain(key.Name)) != 0 {
		return nil, fmt.Errorf("inline invocation is disabled or outside the watched namespaces")
	}
	t := &target{tool: &arkv1alpha1.Tool{}, deployment: &appsv1.Deployment{}, service: &corev1.Service{}}
	if err := a.client.Get(ctx, key, t.tool); err != nil {
		return nil, err
	}
	child := types.NamespacedName{Namespace: key.Namespace, Name: inlinetools.NamesFor(key.Name).Runner}
	if err := a.client.Get(ctx, child, t.deployment); err != nil {
		return nil, err
	}
	if err := a.client.Get(ctx, child, t.service); err != nil {
		return nil, err
	}
	var err error
	t.address, err = inlinetools.ResolveActivation(inlinetools.Enabled(), t.tool, uid, calledName, a.namespace, t.deployment, t.service)
	return t, err
}

func (a *Activator) unchanged(ctx context.Context, initial *target) (*target, error) {
	current, err := a.resolve(ctx, client.ObjectKeyFromObject(initial.tool), initial.tool.UID, initial.tool.Name)
	if err != nil {
		return nil, err
	}
	if current.tool.Generation != initial.tool.Generation || current.deployment.UID != initial.deployment.UID || current.service.UID != initial.service.UID {
		return nil, fmt.Errorf("inline Tool or backend changed during activation")
	}
	return current, nil
}

func (a *Activator) activate(ctx context.Context, initial *target) (*target, error) {
	for {
		current, err := a.unchanged(ctx, initial)
		if err != nil {
			return nil, err
		}
		if current.deployment.Spec.Replicas == nil || *current.deployment.Spec.Replicas != 1 {
			if err := a.scale(ctx, current.deployment, 1); err != nil && !apierrors.IsConflict(err) {
				return nil, err
			}
		} else if ready, err := a.ready(ctx, current); err != nil {
			return nil, err
		} else if ready {
			return current, nil
		}
		timer := time.NewTimer(a.pollInterval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}

func (a *Activator) currentReady(ctx context.Context, initial *target) (*target, error) {
	current, err := a.unchanged(ctx, initial)
	if err != nil {
		return nil, err
	}
	ready, err := a.ready(ctx, current)
	if err != nil {
		return nil, err
	}
	if !ready {
		return nil, fmt.Errorf("runner readiness changed during connection")
	}
	return current, nil
}

// ResourceVersion and UID bind the scale write to the Deployment just checked.
// An ownership change or delete/recreate must conflict, not scale a replacement.
func (a *Activator) scale(ctx context.Context, deployment *appsv1.Deployment, replicas int32) error {
	scale := &autoscalingv1.Scale{
		ObjectMeta: metav1.ObjectMeta{Name: deployment.Name, Namespace: deployment.Namespace, UID: deployment.UID, ResourceVersion: deployment.ResourceVersion},
		Spec:       autoscalingv1.ScaleSpec{Replicas: replicas},
	}
	return a.client.SubResource("scale").Update(ctx, deployment, client.WithSubResourceBody(scale))
}

func (a *Activator) scaleIdle(ctx context.Context, state *activity) error {
	tool := &arkv1alpha1.Tool{}
	if err := a.client.Get(ctx, state.key, tool); err != nil {
		return client.IgnoreNotFound(err)
	}
	if tool.UID != state.uid {
		return nil
	}
	deployment := &appsv1.Deployment{}
	key := types.NamespacedName{Namespace: state.key.Namespace, Name: inlinetools.NamesFor(state.key.Name).Runner}
	if err := a.client.Get(ctx, key, deployment); err != nil {
		return client.IgnoreNotFound(err)
	}
	if !inlinetools.OwnsRunner(deployment, tool) {
		return fmt.Errorf("runner ownership or identity changed before idle scale-down")
	}
	if deployment.Spec.Replicas != nil && *deployment.Spec.Replicas == 0 {
		return nil
	}
	if !inlinetools.Enabled() {
		return nil
	}
	return a.scale(ctx, deployment, 0)
}

func (a *Activator) ready(ctx context.Context, t *target) (bool, error) {
	d := t.deployment
	if d.Spec.Replicas == nil || *d.Spec.Replicas != 1 || d.Status.ObservedGeneration != d.Generation ||
		d.Status.Replicas != 1 || d.Status.UpdatedReplicas != 1 || d.Status.ReadyReplicas != 1 || d.Status.AvailableReplicas != 1 {
		return false, nil
	}
	slices := &discoveryv1.EndpointSliceList{}
	if err := a.client.List(ctx, slices, client.InNamespace(t.tool.Namespace), client.MatchingLabels{discoveryv1.LabelServiceName: t.service.Name}); err != nil {
		return false, err
	}
	found := false
	for _, slice := range slices.Items {
		owner := metav1.GetControllerOf(&slice)
		if owner == nil || owner.Kind != "Service" || owner.APIVersion != "v1" || owner.Name != t.service.Name || owner.UID != t.service.UID ||
			slice.AddressType == discoveryv1.AddressTypeFQDN || len(slice.Ports) != 1 || slice.Ports[0].Port == nil || *slice.Ports[0].Port != t.service.Spec.Ports[0].Port ||
			slice.Ports[0].Protocol == nil || *slice.Ports[0].Protocol != corev1.ProtocolTCP {
			return false, nil
		}
		for _, endpoint := range slice.Endpoints {
			// Unknown readiness is routable to EndpointSlice consumers too.
			if endpoint.Conditions.Ready != nil && !*endpoint.Conditions.Ready {
				continue
			}
			if endpoint.Conditions.Terminating != nil && *endpoint.Conditions.Terminating {
				return false, nil
			}
			valid, err := a.endpointCurrent(ctx, t, endpoint)
			if err != nil || !valid {
				return false, err
			}
			found = true
		}
	}
	return found, nil
}

func (a *Activator) endpointCurrent(ctx context.Context, t *target, endpoint discoveryv1.Endpoint) (bool, error) {
	ref := endpoint.TargetRef
	if ref == nil || ref.Kind != "Pod" || ref.UID == "" || (ref.Namespace != "" && ref.Namespace != t.tool.Namespace) || len(endpoint.Addresses) == 0 {
		return false, nil
	}
	pod := &corev1.Pod{}
	if err := a.client.Get(ctx, types.NamespacedName{Namespace: t.tool.Namespace, Name: ref.Name}, pod); err != nil {
		return false, client.IgnoreNotFound(err)
	}
	if pod.UID != ref.UID || !pod.DeletionTimestamp.IsZero() || !labels.SelectorFromSet(inlinetools.RunnerLabels(t.tool)).Matches(labels.Set(pod.Labels)) ||
		inlinetools.CheckRunnerRevision(&corev1.PodTemplateSpec{ObjectMeta: pod.ObjectMeta, Spec: pod.Spec}, t.tool) != nil {
		return false, nil
	}
	ready := false
	for _, condition := range pod.Status.Conditions {
		if condition.Type == corev1.PodReady && condition.Status == corev1.ConditionTrue {
			ready = true
		}
	}
	if !ready {
		return false, nil
	}
	for _, address := range endpoint.Addresses {
		matches := address == pod.Status.PodIP
		for _, ip := range pod.Status.PodIPs {
			matches = matches || address == ip.IP
		}
		if !matches {
			return false, nil
		}
	}
	owner := metav1.GetControllerOf(pod)
	if owner == nil || owner.Kind != "ReplicaSet" || owner.APIVersion != appsv1.SchemeGroupVersion.String() {
		return false, nil
	}
	rs := &appsv1.ReplicaSet{}
	if err := a.client.Get(ctx, types.NamespacedName{Namespace: t.tool.Namespace, Name: owner.Name}, rs); err != nil {
		return false, client.IgnoreNotFound(err)
	}
	parent := metav1.GetControllerOf(rs)
	return rs.UID == owner.UID && rs.DeletionTimestamp.IsZero() && parent != nil && parent.APIVersion == appsv1.SchemeGroupVersion.String() &&
		parent.Kind == "Deployment" && parent.Name == t.deployment.Name && parent.UID == t.deployment.UID, nil
}
