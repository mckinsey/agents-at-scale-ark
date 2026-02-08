/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/util/intstr"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/common"
	"mckinsey.com/ark/internal/eventing"
)

type ExecutionEngineReconciler struct {
	client.Client
	Scheme   *runtime.Scheme
	Eventing eventing.Provider
	resolver *common.ValueSourceResolverV1PreAlpha1
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=executionengines,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=executionengines/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=executionengines/finalizers,verbs=update
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch
// +kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=services,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch;create;update;patch;delete

func (r *ExecutionEngineReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	var executionEngine arkv1prealpha1.ExecutionEngine
	if err := r.Get(ctx, req.NamespacedName, &executionEngine); err != nil {
		if errors.IsNotFound(err) {
			log.Info("ExecutionEngine deleted", "executionEngine", req.Name)
			return ctrl.Result{}, nil
		}
		log.Error(err, "unable to fetch ExecutionEngine")
		return ctrl.Result{}, err
	}

	if executionEngine.Spec.Container != nil {
		return r.reconcileContainer(ctx, &executionEngine)
	}

	switch executionEngine.Status.Phase {
	case statusReady, statusError:
		return ctrl.Result{}, nil
	case statusRunning:
		return r.processExecutionEngine(ctx, executionEngine)
	default:
		if err := r.updateStatus(ctx, executionEngine, statusRunning, "Resolving execution engine address"); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}
}

func (r *ExecutionEngineReconciler) getResolver() *common.ValueSourceResolverV1PreAlpha1 {
	if r.resolver == nil {
		r.resolver = common.NewValueSourceResolverV1PreAlpha1(r.Client)
	}
	return r.resolver
}

func (r *ExecutionEngineReconciler) processExecutionEngine(ctx context.Context, executionEngine arkv1prealpha1.ExecutionEngine) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	log.Info("Processing execution engine", "executionEngine", executionEngine.Name)

	if executionEngine.Spec.Address == nil {
		if err := r.updateStatus(ctx, executionEngine, statusError, "ExecutionEngine requires either address or container"); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	resolver := r.getResolver()
	resolvedAddress, err := resolver.ResolveValueSource(ctx, *executionEngine.Spec.Address, executionEngine.Namespace)
	if err != nil {
		log.Error(err, "failed to resolve ExecutionEngine address", "executionEngine", executionEngine.Name)
		r.Eventing.ExecutionEngineRecorder().AddressResolutionFailed(ctx, &executionEngine, fmt.Sprintf("Failed to resolve address: %v", err))
		if err := r.updateStatus(ctx, executionEngine, statusError, fmt.Sprintf("Failed to resolve address: %v", err)); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	executionEngine.Status.LastResolvedAddress = resolvedAddress

	if err := r.updateStatus(ctx, executionEngine, statusReady, "ExecutionEngine address resolved successfully"); err != nil {
		return ctrl.Result{}, err
	}

	log.Info("ExecutionEngine processed successfully", "executionEngine", executionEngine.Name, "resolvedAddress", resolvedAddress)
	return ctrl.Result{}, nil
}

func (r *ExecutionEngineReconciler) reconcileContainer(ctx context.Context, ee *arkv1prealpha1.ExecutionEngine) (ctrl.Result, error) {
	log := logf.FromContext(ctx)
	log.Info("Reconciling container execution engine", "executionEngine", ee.Name)

	container := ee.Spec.Container
	port := containerPort(container)
	labels := containerLabels(ee.Name)

	if err := r.reconcileContainerDeployment(ctx, ee, container, port, labels); err != nil {
		_ = r.updateStatus(ctx, *ee, statusError, fmt.Sprintf("Failed to reconcile Deployment: %v", err))
		return ctrl.Result{}, err
	}

	if err := r.reconcileContainerService(ctx, ee, port, labels); err != nil {
		_ = r.updateStatus(ctx, *ee, statusError, fmt.Sprintf("Failed to reconcile Service: %v", err))
		return ctrl.Result{}, err
	}

	resolvedAddress := fmt.Sprintf("http://%s.%s:%d", ee.Name, ee.Namespace, port)
	ee.Status.LastResolvedAddress = resolvedAddress

	if r.isDeploymentReady(ctx, ee.Name, ee.Namespace) {
		if err := r.updateStatus(ctx, *ee, statusReady, "Container execution engine deployed and ready"); err != nil {
			return ctrl.Result{}, err
		}
		log.Info("Container execution engine ready", "executionEngine", ee.Name, "address", resolvedAddress)
	} else {
		if err := r.updateStatus(ctx, *ee, statusRunning, "Waiting for container deployment to become ready"); err != nil {
			return ctrl.Result{}, err
		}
	}

	return ctrl.Result{}, nil
}

func containerPort(container *arkv1prealpha1.ContainerEngineSpec) int32 {
	if container.Port != 0 {
		return container.Port
	}
	return 8000
}

func containerLabels(name string) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":       "execution-engine",
		"app.kubernetes.io/instance":   name,
		"app.kubernetes.io/managed-by": "ark-controller",
	}
}

func (r *ExecutionEngineReconciler) reconcileContainerDeployment(ctx context.Context, ee *arkv1prealpha1.ExecutionEngine, container *arkv1prealpha1.ContainerEngineSpec, port int32, labels map[string]string) error {
	replicas := int32(1)
	if container.Replicas != nil {
		replicas = *container.Replicas
	}

	desired := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      ee.Name,
			Namespace: ee.Namespace,
			Labels:    labels,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: labels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:            "executor",
							Image:           container.Image.Ref,
							ImagePullPolicy: corev1.PullIfNotPresent,
							Command:         container.Command,
							Args:            container.Args,
							Env:             container.Env,
							Resources:       container.Resources,
							Ports: []corev1.ContainerPort{
								{Name: "http", ContainerPort: port, Protocol: corev1.ProtocolTCP},
							},
							ReadinessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/health",
										Port: intstr.FromInt32(port),
									},
								},
								InitialDelaySeconds: 5,
								PeriodSeconds:       10,
							},
							LivenessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/health",
										Port: intstr.FromInt32(port),
									},
								},
								InitialDelaySeconds: 15,
								PeriodSeconds:       20,
							},
						},
					},
				},
			},
		},
	}

	if ws := container.WorkspaceStorage; ws != nil && ws.Enabled {
		mountPath := ws.MountPath
		if mountPath == "" {
			mountPath = "/workspaces"
		}
		pvcName := ws.PVCName
		if pvcName == "" {
			pvcName = "workspace-service-pvc"
		}
		desired.Spec.Template.Spec.Containers[0].VolumeMounts = append(
			desired.Spec.Template.Spec.Containers[0].VolumeMounts,
			corev1.VolumeMount{Name: "workspace-storage", MountPath: mountPath},
		)
		desired.Spec.Template.Spec.Volumes = append(
			desired.Spec.Template.Spec.Volumes,
			corev1.Volume{Name: "workspace-storage", VolumeSource: corev1.VolumeSource{
				PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: pvcName},
			}},
		)
	}

	if container.Image.PullSecretRef != nil {
		desired.Spec.Template.Spec.ImagePullSecrets = []corev1.LocalObjectReference{*container.Image.PullSecretRef}
	}

	if err := ctrl.SetControllerReference(ee, desired, r.Scheme); err != nil {
		return fmt.Errorf("failed to set owner reference on Deployment: %w", err)
	}

	return r.applyDeployment(ctx, desired)
}

func (r *ExecutionEngineReconciler) applyDeployment(ctx context.Context, desired *appsv1.Deployment) error {
	var existing appsv1.Deployment
	err := r.Get(ctx, client.ObjectKeyFromObject(desired), &existing)
	if errors.IsNotFound(err) {
		logf.FromContext(ctx).Info("Creating Deployment for container execution engine", "deployment", desired.Name)
		return r.Create(ctx, desired)
	}
	if err != nil {
		return fmt.Errorf("failed to get Deployment: %w", err)
	}
	existing.Spec = desired.Spec
	existing.Labels = desired.Labels
	return r.Update(ctx, &existing)
}

func (r *ExecutionEngineReconciler) reconcileContainerService(ctx context.Context, ee *arkv1prealpha1.ExecutionEngine, port int32, labels map[string]string) error {
	desired := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      ee.Name,
			Namespace: ee.Namespace,
			Labels:    labels,
		},
		Spec: corev1.ServiceSpec{
			Selector: labels,
			Ports: []corev1.ServicePort{
				{Name: "http", Port: port, TargetPort: intstr.FromInt32(port), Protocol: corev1.ProtocolTCP},
			},
			Type: corev1.ServiceTypeClusterIP,
		},
	}

	if err := ctrl.SetControllerReference(ee, desired, r.Scheme); err != nil {
		return fmt.Errorf("failed to set owner reference on Service: %w", err)
	}

	return r.applyService(ctx, desired)
}

func (r *ExecutionEngineReconciler) applyService(ctx context.Context, desired *corev1.Service) error {
	var existing corev1.Service
	err := r.Get(ctx, client.ObjectKeyFromObject(desired), &existing)
	if errors.IsNotFound(err) {
		logf.FromContext(ctx).Info("Creating Service for container execution engine", "service", desired.Name)
		return r.Create(ctx, desired)
	}
	if err != nil {
		return fmt.Errorf("failed to get Service: %w", err)
	}
	existing.Spec.Selector = desired.Spec.Selector
	existing.Spec.Ports = desired.Spec.Ports
	existing.Labels = desired.Labels
	return r.Update(ctx, &existing)
}

func (r *ExecutionEngineReconciler) isDeploymentReady(ctx context.Context, name, namespace string) bool {
	var dep appsv1.Deployment
	if err := r.Get(ctx, client.ObjectKey{Name: name, Namespace: namespace}, &dep); err != nil {
		return false
	}
	for _, cond := range dep.Status.Conditions {
		if cond.Type == appsv1.DeploymentAvailable && cond.Status == corev1.ConditionTrue {
			return true
		}
	}
	return false
}

func (r *ExecutionEngineReconciler) updateStatus(ctx context.Context, executionEngine arkv1prealpha1.ExecutionEngine, status, message string) error {
	if ctx.Err() != nil {
		return nil
	}
	executionEngine.Status.Phase = status
	executionEngine.Status.Message = message
	err := r.Status().Update(ctx, &executionEngine)
	if err != nil {
		logf.FromContext(ctx).Error(err, "failed to update ExecutionEngine status", "status", status)
	}
	return err
}

func (r *ExecutionEngineReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1prealpha1.ExecutionEngine{}).
		Owns(&appsv1.Deployment{}).
		Owns(&corev1.Service{}).
		Complete(r)
}
