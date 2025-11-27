/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/handler"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

const (
	TeamAvailable = "Available"
)

type TeamReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Recorder record.EventRecorder
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=teams,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=teams/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=teams/finalizers,verbs=update
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=agents,verbs=get;list;watch

//nolint:dupl
func (r *TeamReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var team arkv1alpha1.Team
	if err := r.Get(ctx, req.NamespacedName, &team); err != nil {
		if errors.IsNotFound(err) {
			log.Info("Team resource not found. Ignoring since object must be deleted")
			return ctrl.Result{}, nil
		}
		log.Error(err, "Failed to get Team")
		return ctrl.Result{}, err
	}

	if len(team.Status.Conditions) == 0 {
		r.setCondition(&team, TeamAvailable, metav1.ConditionUnknown, "Initializing", "Team availability is being determined")
		if err := r.updateStatus(ctx, &team); err != nil {
			return ctrl.Result{}, err
		}
		r.Recorder.Event(&team, corev1.EventTypeNormal, "TeamCreated", "Initialized team conditions")
		return ctrl.Result{}, nil
	}

	currentCondition := meta.FindStatusCondition(team.Status.Conditions, TeamAvailable)

	available, reason, message := r.checkMembers(ctx, &team)

	var newStatus metav1.ConditionStatus
	if available {
		newStatus = metav1.ConditionTrue
	} else {
		newStatus = metav1.ConditionFalse
	}

	if currentCondition == nil || currentCondition.Status != newStatus || currentCondition.Reason != reason {
		log.Info("team status changed", "team", team.Name, "available", newStatus, "reason", reason)
		r.setCondition(&team, TeamAvailable, newStatus, reason, message)
		if err := r.updateStatus(ctx, &team); err != nil {
			return ctrl.Result{}, err
		}
		r.Recorder.Event(&team, corev1.EventTypeNormal, "StatusChanged", fmt.Sprintf("Team availability: %s - %s", newStatus, reason))
	}

	return ctrl.Result{}, nil
}

func (r *TeamReconciler) checkMembers(ctx context.Context, team *arkv1alpha1.Team) (available bool, reason, message string) {
	if len(team.Spec.Members) == 0 {
		return false, "NoMembers", "Team has no members configured"
	}

	for _, member := range team.Spec.Members {
		if member.Type != "agent" {
			continue
		}

		var agent arkv1alpha1.Agent
		namespace := team.Namespace
		if err := r.Get(ctx, types.NamespacedName{Name: member.Name, Namespace: namespace}, &agent); err != nil {
			if errors.IsNotFound(err) {
				return false, "MemberNotFound", fmt.Sprintf("Agent member %s not found", member.Name)
			}
			return false, "MemberCheckFailed", fmt.Sprintf("Failed to check agent member %s: %v", member.Name, err)
		}

		agentCondition := meta.FindStatusCondition(agent.Status.Conditions, AgentAvailable)
		if agentCondition == nil || agentCondition.Status != metav1.ConditionTrue {
			return false, "MemberNotAvailable", fmt.Sprintf("Agent member %s is not available", member.Name)
		}
	}

	return true, "Available", "All team members are available"
}

func (r *TeamReconciler) setCondition(team *arkv1alpha1.Team, conditionType string, status metav1.ConditionStatus, reason, message string) {
	meta.SetStatusCondition(&team.Status.Conditions, metav1.Condition{
		Type:               conditionType,
		Status:             status,
		Reason:             reason,
		Message:            message,
		ObservedGeneration: team.Generation,
	})
}

func (r *TeamReconciler) updateStatus(ctx context.Context, team *arkv1alpha1.Team) error {
	if ctx.Err() != nil {
		return nil
	}

	err := r.Status().Update(ctx, team)
	if err != nil {
		logf.FromContext(ctx).Error(err, "failed to update team status")
	}
	return err
}

func (r *TeamReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.Team{}).
		Watches(&arkv1alpha1.Agent{}, handler.EnqueueRequestsFromMapFunc(r.findTeamsForAgent)).
		Named("team").
		Complete(r)
}

func (r *TeamReconciler) findTeamsForAgent(ctx context.Context, obj client.Object) []reconcile.Request {
	agent := obj.(*arkv1alpha1.Agent)

	var teams arkv1alpha1.TeamList
	if err := r.List(ctx, &teams, client.InNamespace(agent.Namespace)); err != nil {
		return []reconcile.Request{}
	}

	var requests []reconcile.Request
	for _, team := range teams.Items {
		for _, member := range team.Spec.Members {
			if member.Type == "agent" && member.Name == agent.Name {
				requests = append(requests, reconcile.Request{
					NamespacedName: types.NamespacedName{
						Name:      team.Name,
						Namespace: team.Namespace,
					},
				})
				break
			}
		}
	}

	return requests
}
