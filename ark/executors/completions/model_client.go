package completions

import (
	"context"
	"fmt"
	"time"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/rest"
	"sigs.k8s.io/controller-runtime/pkg/cache"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

const modelCacheSyncTimeout = 30 * time.Second

type modelCachingClient struct {
	client.Client
	models client.Reader
}

func (c *modelCachingClient) Get(ctx context.Context, key client.ObjectKey, obj client.Object, opts ...client.GetOption) error {
	if _, ok := obj.(*arkv1alpha1.Model); ok {
		return c.models.Get(ctx, key, obj, opts...)
	}
	return c.Client.Get(ctx, key, obj, opts...)
}

func NewModelCachingClient(ctx context.Context, restConfig *rest.Config, scheme *runtime.Scheme, discoveryNamespace string) (client.Client, error) {
	direct, err := client.New(restConfig, client.Options{Scheme: scheme})
	if err != nil {
		return nil, fmt.Errorf("failed to create kubernetes client: %w", err)
	}

	options := cache.Options{Scheme: scheme}
	if discoveryNamespace != "" {
		options.DefaultNamespaces = map[string]cache.Config{discoveryNamespace: {}}
	}

	modelCache, err := cache.New(restConfig, options)
	if err != nil {
		return nil, fmt.Errorf("failed to create Model cache: %w", err)
	}

	if _, err := modelCache.GetInformer(ctx, &arkv1alpha1.Model{}, cache.BlockUntilSynced(false)); err != nil {
		return nil, fmt.Errorf("failed to create Model informer: %w", err)
	}

	go func() {
		if err := modelCache.Start(ctx); err != nil {
			logf.FromContext(ctx).Error(err, "Model cache stopped")
		}
	}()

	syncCtx, cancelSync := context.WithTimeout(ctx, modelCacheSyncTimeout)
	defer cancelSync()

	if !modelCache.WaitForCacheSync(syncCtx) {
		return nil, fmt.Errorf("timed out after %s syncing the Model cache", modelCacheSyncTimeout)
	}

	return &modelCachingClient{Client: direct, models: modelCache}, nil
}
