import { NextResponse } from 'next/server';
import * as k8s from '@kubernetes/client-node';

export async function GET() {
  try {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();

    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const customApi = kc.makeApiClient(k8s.CustomObjectsApi);

    // Get all namespaces with demo label
    const namespacesResponse = await coreApi.listNamespace();
    const demoNamespaces = namespacesResponse.body.items.filter(ns => {
      const labels = ns.metadata?.labels || {};
      return labels['ark.mckinsey.com/demo'] === 'true';
    });

    // Get all HTTPRoutes across all namespaces
    const httpRoutesResponse = await customApi.listClusterCustomObject(
      'gateway.networking.k8s.io',
      'v1',
      'httproutes'
    ) as { body: { items: Array<{ metadata?: { namespace?: string } }> } };

    // Filter demos to only those with HTTPRoutes
    const namespacesWithRoutes = new Set(
      httpRoutesResponse.body.items.map(route => route.metadata?.namespace).filter(Boolean)
    );

    const availableDemos = demoNamespaces
      .filter(ns => namespacesWithRoutes.has(ns.metadata?.name || ''))
      .map(ns => ({
        name: ns.metadata?.name || '',
        displayName: ns.metadata?.annotations?.['ark.mckinsey.com/demo-name'] || ns.metadata?.name || '',
        description: ns.metadata?.annotations?.['ark.mckinsey.com/demo-description'] || '',
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return NextResponse.json(availableDemos);
  } catch (error) {
    console.error('Error fetching demos:', error);
    return NextResponse.json({ error: 'Failed to fetch demos' }, { status: 500 });
  }
}
