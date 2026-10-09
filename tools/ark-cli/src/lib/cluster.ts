import {execa} from 'execa';
import {classifyFailure} from './readinessChecks.js';

export interface ClusterInfo {
  type: 'minikube' | 'kind' | 'k3s' | 'docker-desktop' | 'cloud' | 'unknown';
  ip?: string;
  context?: string;
  namespace?: string;
  error?: string;
}

export async function detectClusterType(): Promise<ClusterInfo> {
  try {
    const {stdout} = await execa('kubectl', ['config', 'current-context']);
    const context = stdout.trim();

    if (context.includes('minikube')) {
      return {type: 'minikube', context};
    } else if (context.includes('kind')) {
      return {type: 'kind', context};
    } else if (context.includes('k3s')) {
      return {type: 'k3s', context};
    } else if (context.includes('docker-desktop')) {
      return {type: 'docker-desktop', context};
    } else if (
      context.includes('gke') ||
      context.includes('eks') ||
      context.includes('aks')
    ) {
      return {type: 'cloud', context};
    } else {
      return {type: 'unknown', context};
    }
  } catch (error) {
    return {
      type: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

const NODE_INTERNAL_IP_JSONPATH =
  'jsonpath={.items[0].status.addresses[?(@.type=="InternalIP")].address}';

const NODE_EXTERNAL_IP_JSONPATH =
  'jsonpath={.items[0].status.addresses[?(@.type=="ExternalIP")].address}';

async function getNodeIp(jsonpath: string): Promise<string> {
  const {stdout} = await execa('kubectl', ['get', 'nodes', '-o', jsonpath]);
  return stdout.trim();
}

async function getIstioGatewayAddress(field: 'ip' | 'hostname') {
  const {stdout} = await execa('kubectl', [
    'get',
    'svc',
    '-n',
    'istio-system',
    'istio-ingressgateway',
    '-o',
    `jsonpath={.status.loadBalancer.ingress[0].${field}}`,
  ]);
  return stdout.trim();
}

async function resolveClusterIp(
  type: ClusterInfo['type']
): Promise<string | undefined> {
  switch (type) {
    case 'minikube':
      try {
        const {stdout} = await execa('minikube', ['ip']);
        return stdout.trim();
      } catch {
        return getNodeIp(NODE_INTERNAL_IP_JSONPATH);
      }

    case 'docker-desktop':
      return 'localhost';

    case 'cloud':
      try {
        const ip = await getIstioGatewayAddress('ip');
        return ip || (await getIstioGatewayAddress('hostname'));
      } catch {
        return getNodeIp(NODE_EXTERNAL_IP_JSONPATH);
      }

    default:
      return getNodeIp(NODE_INTERNAL_IP_JSONPATH);
  }
}

function isForbiddenError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const stderr = (error as Error & {stderr?: unknown}).stderr;
  const text = typeof stderr === 'string' && stderr ? stderr : error.message;
  return classifyFailure(text) === 'forbidden';
}

export async function getClusterInfo(context?: string): Promise<ClusterInfo> {
  let resolvedContext: string | undefined;
  let resolvedNamespace: string | undefined;
  try {
    // If context is provided, use it
    const contextArgs = context ? ['--context', context] : [];

    // Get all config info in one command
    const {stdout: configJson} = await execa('kubectl', [
      'config',
      'view',
      '--minify',
      '-o',
      'json',
      ...contextArgs,
    ]);

    const config = JSON.parse(configJson);
    const currentContext = config['current-context'] || '';
    interface ContextConfig {
      name: string;
      context?: {
        namespace?: string;
      };
    }
    const contextData = config.contexts?.find(
      (c: ContextConfig) => c.name === currentContext
    );
    const namespace = contextData?.context?.namespace || 'default';
    resolvedContext = currentContext;
    resolvedNamespace = namespace;

    // Detect cluster type from context name
    const clusterInfo = await detectClusterType();
    clusterInfo.context = currentContext;
    clusterInfo.namespace = namespace;

    if (clusterInfo.error) {
      return clusterInfo;
    }

    let ip: string | undefined;
    try {
      ip = await resolveClusterIp(clusterInfo.type);
    } catch (error) {
      if (!isForbiddenError(error)) {
        throw error;
      }
      ip = undefined;
    }

    return {...clusterInfo, ip};
  } catch (error) {
    return {
      type: 'unknown',
      ...(resolvedContext !== undefined && {context: resolvedContext}),
      ...(resolvedNamespace !== undefined && {namespace: resolvedNamespace}),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
