/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"os"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// The activator is a singleton alongside the operator. The runner's ingress
// rule names it, so the controller needs its identity before the activator
// itself ships.
const (
	EnvActivatorNamespace = "ARK_INLINE_ACTIVATOR_NAMESPACE"
	activatorNameLabel    = "app.kubernetes.io/name"
	activatorNameValue    = "ark-inline-activator"
)

func activatorNamespace() string {
	if ns := os.Getenv(EnvActivatorNamespace); ns != "" {
		return ns
	}
	return "ark-system"
}

func activatorSelector() map[string]string {
	return map[string]string{activatorNameLabel: activatorNameValue}
}

// reconcileInlineChildren brings the Tool's owned runner objects to the current
// spec. It is idempotent and safe to run on an already-available Tool: source
// edits and drift in any child are corrected here.
func (r *ToolReconciler) reconcileInlineChildren(ctx context.Context, tool *arkv1alpha1.Tool) error {
	image, err := inlineImage(tool)
	if err != nil {
		return err
	}
	deployment, err := inlineDeployment(tool, image)
	if err != nil {
		return err
	}

	// Each desired value is captured in a local before the apply: CreateOrUpdate
	// reads the live object into the one it is given, so a mutate function that
	// read fields back off that object would only ever copy the cluster's own
	// state and an edit would never be written.
	configMap := inlineSourceConfigMap(tool)
	desiredData := configMap.Data
	if err := r.applyInlineChild(ctx, tool, configMap, func(existing client.Object) {
		existing.(*corev1.ConfigMap).Data = desiredData
	}); err != nil {
		return err
	}

	serviceAccount := inlineServiceAccount(tool)
	desiredAutomount := serviceAccount.AutomountServiceAccountToken
	if err := r.applyInlineChild(ctx, tool, serviceAccount, func(existing client.Object) {
		existing.(*corev1.ServiceAccount).AutomountServiceAccountToken = desiredAutomount
	}); err != nil {
		return err
	}

	policy := inlineNetworkPolicy(tool, activatorSelector(), activatorNamespace())
	desiredPolicy := policy.Spec
	if err := r.applyInlineChild(ctx, tool, policy, func(existing client.Object) {
		existing.(*networkingv1.NetworkPolicy).Spec = desiredPolicy
	}); err != nil {
		return err
	}

	service := inlineService(tool)
	desiredService := service.Spec
	if err := r.applyInlineChild(ctx, tool, service, func(existing client.Object) {
		current := existing.(*corev1.Service)
		// ClusterIP is assigned by the API server and is immutable.
		clusterIP := current.Spec.ClusterIP
		current.Spec = desiredService
		current.Spec.ClusterIP = clusterIP
	}); err != nil {
		return err
	}

	desiredDeployment := deployment.Spec
	return r.applyInlineChild(ctx, tool, deployment, func(existing client.Object) {
		current := existing.(*appsv1.Deployment)
		// Replicas are deliberately left alone: the activator owns the active
		// count, and rewriting it here would scale a runner to zero underneath
		// a call in flight.
		replicas := current.Spec.Replicas
		current.Spec = desiredDeployment
		current.Spec.Replicas = replicas
	})
}

// applyInlineChild creates or updates one child, refusing to adopt an object
// this Tool does not own. A name collision with an unrelated resource is an
// error, not something to overwrite.
func (r *ToolReconciler) applyInlineChild(ctx context.Context, tool *arkv1alpha1.Tool, desired client.Object, mutate func(existing client.Object)) error {
	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, desired, func() error {
		if err := ownedByTool(desired, tool); err != nil {
			return err
		}
		mutate(desired)
		desired.SetLabels(mergeLabels(desired.GetLabels(), inlineLabels(tool)))
		return controllerutil.SetControllerReference(tool, desired, r.Scheme)
	})
	if err != nil {
		return fmt.Errorf("failed to reconcile %T %s/%s: %w", desired, desired.GetNamespace(), desired.GetName(), err)
	}
	return nil
}

// ownedByTool reports whether an existing object belongs to this Tool. A
// missing controller reference means the object is new (CreateOrUpdate has not
// fetched anything) or belongs to nobody, and only the latter is ambiguous:
// creation-time objects carry no resourceVersion.
func ownedByTool(obj client.Object, tool *arkv1alpha1.Tool) error {
	if obj.GetResourceVersion() == "" {
		return nil
	}
	owner := metav1.GetControllerOf(obj)
	if owner != nil && owner.UID == tool.UID {
		return nil
	}
	return fmt.Errorf("%s/%s already exists and is not owned by tool %s (uid %s): rename the tool or remove the conflicting resource",
		obj.GetNamespace(), obj.GetName(), tool.Name, tool.UID)
}

func mergeLabels(existing, desired map[string]string) map[string]string {
	if existing == nil {
		return desired
	}
	for key, value := range desired {
		existing[key] = value
	}
	return existing
}
