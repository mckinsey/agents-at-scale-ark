import * as k8s from '@kubernetes/client-node';

export interface Demo {
  name: string;
  displayName: string;
  description: string;
}

export async function fetchDemos(): Promise<Demo[]> {
  const kc = new k8s.KubeConfig();
  kc.loadFromDefault();

  const coreApi = kc.makeApiClient(k8s.CoreV1Api);
  const customApi = kc.makeApiClient(k8s.CustomObjectsApi);

  const namespacesResponse = await coreApi.listNamespace();
  const demoNamespaces = namespacesResponse.items.filter(ns => {
    const labels = ns.metadata?.labels || {};
    return labels['ark.mckinsey.com/demo'] === 'true';
  });

  const httpRoutesResponse = await customApi.listClusterCustomObject({
    group: 'gateway.networking.k8s.io',
    version: 'v1',
    plural: 'httproutes'
  }) as { items: Array<{ metadata?: { namespace?: string } }> };

  const namespacesWithRoutes = new Set(
    httpRoutesResponse.items.map(route => route.metadata?.namespace).filter(Boolean)
  );

  return demoNamespaces
    .filter(ns => namespacesWithRoutes.has(ns.metadata?.name || ''))
    .map(ns => ({
      name: ns.metadata?.name || '',
      displayName: ns.metadata?.annotations?.['ark.mckinsey.com/demo-name'] || ns.metadata?.name || '',
      description: ns.metadata?.annotations?.['ark.mckinsey.com/demo-description'] || '',
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
