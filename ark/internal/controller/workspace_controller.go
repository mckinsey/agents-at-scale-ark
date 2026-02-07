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
	"mckinsey.com/ark/internal/eventing"
	eventingconfig "mckinsey.com/ark/internal/eventing/config"
	"mckinsey.com/ark/internal/genai"
)

const (
	phaseReady        = "Ready"
	phaseError        = "Error"
	phaseProvisioning = "Provisioning"
	phaseTerminating  = "Terminating"
)

type WorkspaceReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Eventing *eventingconfig.Provider
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
	case phaseReady:
		if requeueAfter > 0 {
			return ctrl.Result{RequeueAfter: requeueAfter}, nil
		}
		return ctrl.Result{}, nil
	case phaseError:
		return ctrl.Result{}, nil
	case phaseProvisioning:
		return ctrl.Result{RequeueAfter: 5 * time.Second}, nil
	default:
		r.setPhase(ws, phaseProvisioning)
		if err := r.provisionWorkspace(ctx, ws); err != nil {
			log.Error(err, "failed to provision workspace")
			r.setPhase(ws, phaseError)
			r.setCondition(ws, phaseReady, metav1.ConditionFalse, "ProvisionFailed", err.Error())
		} else {
			r.setPhase(ws, phaseReady)
			r.setCondition(ws, phaseReady, metav1.ConditionTrue, "Provisioned", "Workspace provisioned successfully")
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

func (r *WorkspaceReconciler) workspaceRecorder() eventing.WorkspaceRecorder {
	if r.Eventing != nil {
		return r.Eventing.WorkspaceRecorder()
	}
	return nil
}

func (r *WorkspaceReconciler) provisionWorkspace(ctx context.Context, ws *arkv1alpha1.Workspace) error {
	log := logf.FromContext(ctx)
	wsClient := genai.NewWorkspaceClient(r.workspaceRecorder())

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

	if provisioned == nil {
		return nil
	}

	if err := wsClient.ReleaseWorkspace(ctx, provisioned.ID, string(ws.UID), nil); err != nil {
		log.Error(err, "failed to release workspace after provisioning", "workspaceId", provisioned.ID)
		if rec := r.workspaceRecorder(); rec != nil {
			rec.ReleaseFailed(ctx, ws, err.Error())
		}
	}

	if err := r.saveWorkspaceAnnotation(ctx, ws, provisioned.ID); err != nil {
		return err
	}

	r.updateProvisionedStatus(ws, provisioned)
	return nil
}

func (r *WorkspaceReconciler) saveWorkspaceAnnotation(ctx context.Context, ws *arkv1alpha1.Workspace, workspaceID string) error {
	if ws.Annotations == nil {
		ws.Annotations = make(map[string]string)
	}
	ws.Annotations[annotations.WorkspaceID] = workspaceID
	if err := r.Update(ctx, ws); err != nil {
		return err
	}

	if err := r.Get(ctx, client.ObjectKeyFromObject(ws), ws); err != nil {
		return fmt.Errorf("failed to re-fetch workspace after annotation update: %w", err)
	}
	return nil
}

func (r *WorkspaceReconciler) updateProvisionedStatus(ws *arkv1alpha1.Workspace, provisioned *genai.ProvisionedWorkspace) {
	ws.Status.Path = provisioned.Path
	now := metav1.Now()

	if ws.Spec.Environment != nil && ws.Spec.Environment.Image != nil {
		ws.Status.EnvironmentStatus = &arkv1alpha1.WorkspaceEnvironmentStatus{
			Image: ws.Spec.Environment.Image.Ref,
			Ready: true,
		}
	}

	if ws.Spec.Content != nil {
		ws.Status.ContentStatus = r.buildContentStatus(ws, provisioned, &now)
	}

	ws.Status.LastSynced = &now
}

func (r *WorkspaceReconciler) buildContentStatus(ws *arkv1alpha1.Workspace, provisioned *genai.ProvisionedWorkspace, now *metav1.Time) *arkv1alpha1.WorkspaceContentStatus {
	switch {
	case ws.Spec.Content.Git != nil:
		gitStatus := &arkv1alpha1.WorkspaceGitStatus{
			Branch: ws.Spec.Content.Git.Branch,
		}
		if provisioned.GitInfo != nil {
			gitStatus.LastCommit = provisioned.GitInfo.LastCommit
			gitStatus.Dirty = provisioned.GitInfo.Dirty
		}
		return &arkv1alpha1.WorkspaceContentStatus{Type: "git", Git: gitStatus}
	case ws.Spec.Content.ObjectStorage != nil:
		return &arkv1alpha1.WorkspaceContentStatus{
			Type:          "objectStorage",
			ObjectStorage: &arkv1alpha1.WorkspaceObjectStorageStatus{Provider: ws.Spec.Content.ObjectStorage.Provider, LastSynced: now},
		}
	case ws.Spec.Content.Archive != nil:
		return &arkv1alpha1.WorkspaceContentStatus{
			Type:    "archive",
			Archive: &arkv1alpha1.WorkspaceArchiveStatus{ExtractedAt: now},
		}
	default:
		return nil
	}
}

func (r *WorkspaceReconciler) handleDeletion(ctx context.Context, ws *arkv1alpha1.Workspace) (ctrl.Result, error) {
	if !controllerutil.ContainsFinalizer(ws, annotations.WorkspaceFinalizer) {
		return ctrl.Result{}, nil
	}

	r.setPhase(ws, phaseTerminating)
	if err := r.Status().Update(ctx, ws); err != nil {
		return ctrl.Result{}, err
	}

	r.cleanupWorkspaceOnDeletion(ctx, ws)

	if err := r.Get(ctx, client.ObjectKeyFromObject(ws), ws); err != nil {
		return ctrl.Result{}, err
	}
	controllerutil.RemoveFinalizer(ws, annotations.WorkspaceFinalizer)
	if err := r.Update(ctx, ws); err != nil {
		return ctrl.Result{}, err
	}

	return ctrl.Result{}, nil
}

func (r *WorkspaceReconciler) cleanupWorkspaceOnDeletion(ctx context.Context, ws *arkv1alpha1.Workspace) {
	wsID := ws.Annotations[annotations.WorkspaceID]
	if wsID == "" {
		return
	}

	wsClient := genai.NewWorkspaceClient(r.workspaceRecorder())
	if err := wsClient.CleanupWorkspace(ctx, wsID); err != nil {
		logf.FromContext(ctx).Error(err, "failed to cleanup workspace during deletion", "workspaceId", wsID)
		if rec := r.workspaceRecorder(); rec != nil {
			rec.CleanupFailed(ctx, ws, err.Error())
		}
	}
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
