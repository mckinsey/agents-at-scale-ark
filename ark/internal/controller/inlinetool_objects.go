/* Copyright 2025. McKinsey & Company */

package controller

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"path/filepath"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/utils/ptr"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools/runner"
)

// Child name suffixes. The source ConfigMap keeps a stable name so its contents
// are updated in place rather than accumulating revisions.
const (
	inlineSourceSuffix = "-source"
	inlineRunnerSuffix = "-runner"
	inlineSourceKey    = "source"

	// LabelInlineTool and LabelInlineToolUID identify a runner's owner. The UID
	// label is what distinguishes a recreated Tool from its predecessor.
	LabelInlineTool    = "ark.mckinsey.com/inline-tool"
	LabelInlineToolUID = "ark.mckinsey.com/inline-tool-uid"
	// AnnotationInlineSourceHash rolls the pod template when source changes.
	AnnotationInlineSourceHash = "ark.mckinsey.com/inline-source-hash"

	inlineRunnerUser  int64 = 65532
	inlineScratchPath       = "/tmp"
)

// inlineNames are the deterministic child names for one Tool.
type inlineNames struct {
	Source string
	Runner string
}

func inlineChildNames(toolName string) inlineNames {
	return inlineNames{
		Source: childName(toolName, inlineSourceSuffix),
		Runner: childName(toolName, inlineRunnerSuffix),
	}
}

// childName keeps names inside the 63-character limit that applies to the
// labels and pod-template names derived from them, deterministically: a
// too-long Tool name is truncated and disambiguated by a hash of the full name,
// so two long names that share a prefix still get different children.
func childName(toolName, suffix string) string {
	const maxLen = 63
	if len(toolName)+len(suffix) <= maxLen {
		return toolName + suffix
	}
	sum := sha256.Sum256([]byte(toolName))
	digest := hex.EncodeToString(sum[:])[:8]
	keep := maxLen - len(suffix) - len(digest) - 1
	return toolName[:keep] + "-" + digest + suffix
}

func inlineLabels(tool *arkv1alpha1.Tool) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":       "ark-inline-runner",
		"app.kubernetes.io/managed-by": "ark-controller",
		LabelInlineTool:                labelValue(tool.Name),
		LabelInlineToolUID:             string(tool.UID),
	}
}

func labelValue(value string) string {
	if len(value) <= 63 {
		return value
	}
	return value[:63]
}

// inlineSourceConfigMap holds the script. Its name never changes, so an edit is
// an in-place update and no stale ConfigMaps accumulate.
func inlineSourceConfigMap(tool *arkv1alpha1.Tool) *corev1.ConfigMap {
	return &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      inlineChildNames(tool.Name).Source,
			Namespace: tool.Namespace,
			Labels:    inlineLabels(tool),
		},
		Data: map[string]string{inlineSourceKey: tool.Spec.Inline.Source},
	}
}

// inlineServiceAccount exists so the runner does not use the namespace default;
// no token is mounted into the pod and it is bound to nothing.
func inlineServiceAccount(tool *arkv1alpha1.Tool) *corev1.ServiceAccount {
	return &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{
			Name:      inlineChildNames(tool.Name).Runner,
			Namespace: tool.Namespace,
			Labels:    inlineLabels(tool),
		},
		AutomountServiceAccountToken: ptr.To(false),
	}
}

func inlineService(tool *arkv1alpha1.Tool) *corev1.Service {
	names := inlineChildNames(tool.Name)
	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      names.Runner,
			Namespace: tool.Namespace,
			Labels:    inlineLabels(tool),
		},
		Spec: corev1.ServiceSpec{
			// ClusterIP only: this feature publishes no Ingress, gateway route,
			// or external Service for a runner.
			Type:     corev1.ServiceTypeClusterIP,
			Selector: inlineLabels(tool),
			Ports: []corev1.ServicePort{{
				Name:       runner.PortName,
				Port:       runner.Port,
				TargetPort: intstr.FromInt32(runner.Port),
				Protocol:   corev1.ProtocolTCP,
			}},
		},
	}
}

// inlineNetworkPolicy denies all runner egress and admits ingress only from the
// activator. It is additive with any other policy in the namespace, which is
// why the controller also reports conflicts rather than assuming this is the
// whole story.
func inlineNetworkPolicy(tool *arkv1alpha1.Tool, activatorSelector map[string]string, activatorNamespace string) *networkingv1.NetworkPolicy {
	return &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{
			Name:      inlineChildNames(tool.Name).Runner,
			Namespace: tool.Namespace,
			Labels:    inlineLabels(tool),
		},
		Spec: networkingv1.NetworkPolicySpec{
			PodSelector: metav1.LabelSelector{MatchLabels: inlineLabels(tool)},
			PolicyTypes: []networkingv1.PolicyType{
				networkingv1.PolicyTypeIngress,
				networkingv1.PolicyTypeEgress,
			},
			Ingress: []networkingv1.NetworkPolicyIngressRule{{
				From: []networkingv1.NetworkPolicyPeer{{
					PodSelector: &metav1.LabelSelector{MatchLabels: activatorSelector},
					NamespaceSelector: &metav1.LabelSelector{
						MatchLabels: map[string]string{corev1.LabelMetadataName: activatorNamespace},
					},
				}},
				Ports: []networkingv1.NetworkPolicyPort{{
					Port:     ptr.To(intstr.FromInt32(runner.Port)),
					Protocol: ptr.To(corev1.ProtocolTCP),
				}},
			}},
			// No egress rules with PolicyTypeEgress set denies all egress,
			// including DNS: a script has nothing to resolve or reach.
			Egress: nil,
		},
	}
}

// inlineDeployment is the runner itself: zero replicas until the activator
// scales it up for a call.
func inlineDeployment(tool *arkv1alpha1.Tool, image string) (*appsv1.Deployment, error) {
	sourcePath, err := runner.SourceFilename(tool.Spec.Inline.Language)
	if err != nil {
		return nil, err
	}
	names := inlineChildNames(tool.Name)
	labels := inlineLabels(tool)
	hash := runner.SourceHash(tool.Spec.Inline.Source)

	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      names.Runner,
			Namespace: tool.Namespace,
			Labels:    labels,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: ptr.To(int32(0)),
			Selector: &metav1.LabelSelector{MatchLabels: labels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: labels,
					// The hash rolls the template on every source change, so a
					// pod's snapshot always matches the revision it serves.
					Annotations: map[string]string{AnnotationInlineSourceHash: hash},
				},
				Spec: corev1.PodSpec{
					ServiceAccountName:           names.Runner,
					AutomountServiceAccountToken: ptr.To(false),
					SecurityContext: &corev1.PodSecurityContext{
						RunAsNonRoot:   ptr.To(true),
						RunAsUser:      ptr.To(inlineRunnerUser),
						RunAsGroup:     ptr.To(inlineRunnerUser),
						SeccompProfile: &corev1.SeccompProfile{Type: corev1.SeccompProfileTypeRuntimeDefault},
					},
					Containers: []corev1.Container{{
						Name:  "runner",
						Image: image,
						Env: []corev1.EnvVar{
							{Name: runner.EnvToolName, Value: tool.Name},
							{Name: runner.EnvLanguage, Value: tool.Spec.Inline.Language},
							{Name: runner.EnvSourceHash, Value: hash},
						},
						Ports: []corev1.ContainerPort{{
							Name:          runner.PortName,
							ContainerPort: runner.Port,
							Protocol:      corev1.ProtocolTCP,
						}},
						ReadinessProbe: &corev1.Probe{
							ProbeHandler: corev1.ProbeHandler{
								HTTPGet: &corev1.HTTPGetAction{
									Path: runner.ReadyPath,
									Port: intstr.FromInt32(runner.Port),
								},
							},
							PeriodSeconds:    2,
							FailureThreshold: 3,
						},
						Resources: corev1.ResourceRequirements{
							// Requests are set explicitly and below the limits:
							// defaulting them to the limits would reserve 500m
							// and 256Mi on every cold start, which is what
							// leaves activation waiting on scheduling.
							Requests: corev1.ResourceList{
								corev1.ResourceCPU:    resource.MustParse("50m"),
								corev1.ResourceMemory: resource.MustParse("64Mi"),
							},
							Limits: corev1.ResourceList{
								corev1.ResourceCPU:    resource.MustParse("500m"),
								corev1.ResourceMemory: resource.MustParse("256Mi"),
							},
						},
						SecurityContext: &corev1.SecurityContext{
							ReadOnlyRootFilesystem:   ptr.To(true),
							AllowPrivilegeEscalation: ptr.To(false),
							Capabilities:             &corev1.Capabilities{Drop: []corev1.Capability{"ALL"}},
						},
						VolumeMounts: []corev1.VolumeMount{
							{
								Name: "source",
								// subPath gives the pod a fixed snapshot: kubelet
								// never updates a subPath mount, so a running
								// pod cannot silently switch revisions.
								MountPath: sourcePath,
								SubPath:   filepath.Base(sourcePath),
								ReadOnly:  true,
							},
							{Name: "scratch", MountPath: inlineScratchPath},
						},
					}},
					Volumes: []corev1.Volume{
						{
							Name: "source",
							VolumeSource: corev1.VolumeSource{
								ConfigMap: &corev1.ConfigMapVolumeSource{
									LocalObjectReference: corev1.LocalObjectReference{Name: names.Source},
									Items: []corev1.KeyToPath{{
										Key:  inlineSourceKey,
										Path: filepath.Base(sourcePath),
									}},
									DefaultMode: ptr.To(int32(0o444)),
								},
							},
						},
						{
							// A read-only root filesystem leaves nothing
							// writable, and some runtimes need a scratch path.
							// Bounded and ephemeral: not tool state.
							Name: "scratch",
							VolumeSource: corev1.VolumeSource{
								EmptyDir: &corev1.EmptyDirVolumeSource{
									SizeLimit: ptr.To(resource.MustParse("16Mi")),
								},
							},
						},
					},
				},
			},
		},
	}, nil
}

func inlineImage(tool *arkv1alpha1.Tool) (string, error) {
	image, err := runner.ImageFor(tool.Spec.Inline.Language)
	if err != nil {
		return "", fmt.Errorf("cannot provision a runner for tool %s/%s: %w", tool.Namespace, tool.Name, err)
	}
	return image, nil
}
