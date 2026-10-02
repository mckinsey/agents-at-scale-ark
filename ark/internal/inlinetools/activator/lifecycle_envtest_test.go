/* Copyright 2025. McKinsey & Company */

package activator

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	autoscalingv1 "k8s.io/api/autoscaling/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/envtest"
)

func TestActivatorScalePreconditionsEnvtest(t *testing.T) {
	environment := &envtest.Environment{}
	if os.Getenv("KUBEBUILDER_ASSETS") == "" {
		assets, err := filepath.Glob(filepath.Join("..", "..", "..", "bin", "k8s", "*"))
		require.NoError(t, err)
		if len(assets) > 0 {
			environment.BinaryAssetsDirectory = assets[0]
		}
	}
	config, err := environment.Start()
	require.NoError(t, err, "run make setup-envtest before running envtest directly")
	t.Cleanup(func() { require.NoError(t, environment.Stop()) })
	scheme := runtime.NewScheme()
	require.NoError(t, corev1.AddToScheme(scheme))
	require.NoError(t, appsv1.AddToScheme(scheme))
	require.NoError(t, autoscalingv1.AddToScheme(scheme))
	kube, err := client.New(config, client.Options{Scheme: scheme})
	require.NoError(t, err)
	a := &Activator{client: kube}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	require.NoError(t, kube.Create(ctx, &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "tenant"}}))
	deployment := lifeFixture("echo", 1).deployment
	deployment.UID, deployment.ResourceVersion, deployment.Generation, deployment.OwnerReferences = "", "", 0, nil
	deployment.Status = appsv1.DeploymentStatus{}
	require.NoError(t, kube.Create(ctx, deployment))
	stale := deployment.DeepCopy()
	deployment.Labels["changed-after-check"] = "true"
	require.NoError(t, kube.Update(ctx, deployment))
	assert.True(t, apierrors.IsConflict(a.scale(ctx, stale, 0)), "a concurrent change must reject the stale scale write")
	current := &appsv1.Deployment{}
	require.NoError(t, kube.Get(ctx, client.ObjectKeyFromObject(deployment), current))
	assert.EqualValues(t, 1, *current.Spec.Replicas)
	template := current.Spec.Template.DeepCopy()
	require.NoError(t, a.scale(ctx, current, 0))
	require.NoError(t, kube.Get(ctx, client.ObjectKeyFromObject(deployment), current))
	assert.Zero(t, *current.Spec.Replicas)
	assert.Equal(t, *template, current.Spec.Template, "scaling must not write the pod template")

	stale = current.DeepCopy()
	require.NoError(t, kube.Delete(ctx, current))
	require.Eventually(t, func() bool {
		return apierrors.IsNotFound(kube.Get(ctx, client.ObjectKeyFromObject(stale), &appsv1.Deployment{}))
	}, time.Second, 10*time.Millisecond)
	replacement := lifeFixture("echo", 1).deployment
	replacement.UID, replacement.ResourceVersion, replacement.Generation, replacement.OwnerReferences = "", "", 0, nil
	replacement.Status = appsv1.DeploymentStatus{}
	require.NoError(t, kube.Create(ctx, replacement))
	assert.NotEqual(t, stale.UID, replacement.UID)
	require.Error(t, a.scale(ctx, stale, 0), "a checked identity must not scale its replacement")
	require.NoError(t, kube.Get(ctx, client.ObjectKeyFromObject(replacement), current))
	assert.EqualValues(t, 1, *current.Spec.Replicas)
}
