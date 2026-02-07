/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"time"

	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/genai"
)

type WorkspaceReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=workspaces,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=workspaces/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=workspaces/finalizers,verbs=update

func (r *WorkspaceReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var ws arkv1alpha1.Workspace
	if err := r.Get(ctx, req.NamespacedName, &ws); err != nil {
		if errors.IsNotFound(err) {
			return ctrl.Result{}, nil
		}
		log.Error(err, "unable to fetch Workspace")
		return ctrl.Result{}, err
	}

	if !ws.DeletionTimestamp.IsZero() {
		return r.handleDeletion(ctx, &ws)
	}

	if !controllerutil.ContainsFinalizer(&ws, annotations.WorkspaceFinalizer) {
		controllerutil.AddFinalizer(&ws, annotations.WorkspaceFinalizer)
		if err := r.Update(ctx, &ws); err != nil {
			return ctrl.Result{}, err
		}
	}

	if ws.Spec.TTL != nil && ws.Spec.TTL.Duration > 0 {
		expiry := ws.CreationTimestamp.Add(ws.Spec.TTL.Duration)
		if time.Now().After(expiry) {
			log.Info("workspace TTL expired, deleting", "workspace", ws.Name)
			if err := r.Delete(ctx, &ws); err != nil {
				return ctrl.Result{}, err
			}
			return ctrl.Result{}, nil
		}
		return r.reconcileWorkspace(ctx, &ws, time.Until(expiry))
	}

	return r.reconcileWorkspace(ctx, &ws, 0)
}

func (r *WorkspaceReconciler) reconcileWorkspace(ctx context.Context, ws *arkv1alpha1.Workspace, requeueAfter time.Duration) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	switch ws.Status.Phase {
	case "Ready":
		if requeueAfter > 0 {
			return ctrl.Result{RequeueAfter: requeueAfter}, nil
		}
		return ctrl.Result{}, nil
	case "Error":
		return ctrl.Result{}, nil
	case "Provisioning":
		return ctrl.Result{RequeueAfter: 5 * time.Second}, nil
	default:
		r.setPhase(ws, "Provisioning")
		if err := r.provisionWorkspace(ctx, ws); err != nil {
			log.Error(err, "failed to provision workspace")
			r.setPhase(ws, "Error")
			r.setCondition(ws, "Ready", metav1.ConditionFalse, "ProvisionFailed", err.Error())
		} else {
			r.setPhase(ws, "Ready")
			r.setCondition(ws, "Ready", metav1.ConditionTrue, "Provisioned", "Workspace provisioned successfully")
		}

		if err := r.Status().Update(ctx, ws); err != nil {
			log.Error(err, "failed to update workspace status")
			return ctrl.Result{}, err
		}

		if requeueAfter > 0 {
			return ctrl.Result{RequeueAfter: requeueAfter}, nil
		}
		return ctrl.Result{}, nil
	}
}

func (r *WorkspaceReconciler) provisionWorkspace(ctx context.Context, ws *arkv1alpha1.Workspace) error {
	wsClient := genai.NewWorkspaceClient(nil)

	persistent := true
	if ws.Spec.Persistent != nil {
		persistent = *ws.Spec.Persistent
	}

	qw := &arkv1alpha1.QueryWorkspace{
		Environment: ws.Spec.Environment,
		Content:     ws.Spec.Content,
		MountPath:   ws.Spec.MountPath,
		Persistent:  &persistent,
	}

	credentials, err := genai.ResolveWorkspaceCredentials(ctx, r.Client, ws.Spec.Content, ws.Namespace)
	if err != nil {
		return fmt.Errorf("failed to resolve workspace credentials: %w", err)
	}

	provisioned, err := wsClient.ProvisionWorkspace(ctx, string(ws.UID), qw, credentials)
	if err != nil {
		return fmt.Errorf("failed to provision workspace: %w", err)
	}

	if provisioned != nil {
		if ws.Annotations == nil {
			ws.Annotations = make(map[string]string)
		}
		ws.Annotations[annotations.WorkspaceID] = provisioned.ID
		if err := r.Update(ctx, ws); err != nil {
			return err
		}

		if err := r.Get(ctx, client.ObjectKeyFromObject(ws), ws); err != nil {
			return fmt.Errorf("failed to re-fetch workspace after annotation update: %w", err)
		}

		ws.Status.Path = provisioned.Path

		if ws.Spec.Environment != nil && ws.Spec.Environment.Image != nil {
			ws.Status.EnvironmentStatus = &arkv1alpha1.WorkspaceEnvironmentStatus{
				Image: ws.Spec.Environment.Image.Ref,
				Ready: true,
			}
		}

		if ws.Spec.Content != nil && ws.Spec.Content.Git != nil {
			ws.Status.ContentStatus = &arkv1alpha1.WorkspaceContentStatus{
				Type: "git",
				Git: &arkv1alpha1.WorkspaceGitStatus{
					Branch: ws.Spec.Content.Git.Branch,
				},
			}
		}

		now := metav1.Now()
		ws.Status.LastSynced = &now
	}

	return nil
}

func (r *WorkspaceReconciler) handleDeletion(ctx context.Context, ws *arkv1alpha1.Workspace) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	if controllerutil.ContainsFinalizer(ws, annotations.WorkspaceFinalizer) {
		r.setPhase(ws, "Terminating")
		if err := r.Status().Update(ctx, ws); err != nil {
			return ctrl.Result{}, err
		}

		if wsID := ws.Annotations[annotations.WorkspaceID]; wsID != "" {
			wsClient := genai.NewWorkspaceClient(nil)
			if err := wsClient.CleanupWorkspace(ctx, wsID); err != nil {
				log.Error(err, "failed to cleanup workspace during deletion", "workspaceId", wsID)
			}
		}

		if err := r.Get(ctx, client.ObjectKeyFromObject(ws), ws); err != nil {
			return ctrl.Result{}, err
		}
		controllerutil.RemoveFinalizer(ws, annotations.WorkspaceFinalizer)
		if err := r.Update(ctx, ws); err != nil {
			return ctrl.Result{}, err
		}
	}

	return ctrl.Result{}, nil
}

func (r *WorkspaceReconciler) setPhase(ws *arkv1alpha1.Workspace, phase string) {
	ws.Status.Phase = phase
}

func (r *WorkspaceReconciler) setCondition(ws *arkv1alpha1.Workspace, condType string, status metav1.ConditionStatus, reason, message string) {
	meta.SetStatusCondition(&ws.Status.Conditions, metav1.Condition{
		Type:               condType,
		Status:             status,
		Reason:             reason,
		Message:            message,
		LastTransitionTime: metav1.Now(),
	})
}

func (r *WorkspaceReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Workspace{}).
		Named("workspace").
		Complete(r)
}
