import {execa} from 'execa';

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

export async function getClusterInfo(context?: string): Promise<ClusterInfo> {
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

    // Detect cluster type from context name
    const clusterInfo = await detectClusterType();
    clusterInfo.context = currentContext;
    clusterInfo.namespace = namespace;

    if (clusterInfo.error) {
      return clusterInfo;
    }

    let ip: string | undefined;

    switch (clusterInfo.type) {
      case 'minikube':
        try {
          const {stdout} = await execa('minikube', ['ip']);
          ip = stdout.trim();
        } catch {
          // Fallback to kubectl if minikube command fails
          const {stdout} = await execa('kubectl', [
            'get',
            'nodes',
            '-o',
            'jsonpath={.items[0].status.addresses[?(@.type=="InternalIP")].address}',
          ]);
          ip = stdout.trim();
        }
        break;

      case 'kind': {
        const {stdout: kindOutput} = await execa('kubectl', [
          'get',
          'nodes',
          '-o',
          'jsonpath={.items[0].status.addresses[?(@.type=="InternalIP")].address}',
        ]);
        ip = kindOutput.trim();
        break;
      }

      case 'docker-desktop':
        ip = 'localhost';
        break;

      case 'k3s': {
        const {stdout: k3sOutput} = await execa('kubectl', [
          'get',
          'nodes',
          '-o',
          'jsonpath={.items[0].status.addresses[?(@.type=="InternalIP")].address}',
        ]);
        ip = k3sOutput.trim();
        break;
      }

      case 'cloud':
        // For cloud clusters, try to get the external IP or load balancer IP
        try {
          const {stdout: lbOutput} = await execa('kubectl', [
            'get',
            'svc',
            '-n',
            'istio-system',
            'istio-ingressgateway',
            '-o',
            'jsonpath={.status.loadBalancer.ingress[0].ip}',
          ]);
          ip = lbOutput.trim();
          if (!ip) {
            const {stdout: hostnameOutput} = await execa('kubectl', [
              'get',
              'svc',
              '-n',
              'istio-system',
              'istio-ingressgateway',
              '-o',
              'jsonpath={.status.loadBalancer.ingress[0].hostname}',
            ]);
            ip = hostnameOutput.trim();
          }
        } catch {
          // Fallback to node IP
          const {stdout: nodeOutput} = await execa('kubectl', [
            'get',
            'nodes',
            '-o',
            'jsonpath={.items[0].status.addresses[?(@.type=="ExternalIP")].address}',
          ]);
          ip = nodeOutput.trim();
        }
        break;

      default: {
        const {stdout: defaultOutput} = await execa('kubectl', [
          'get',
          'nodes',
          '-o',
          'jsonpath={.items[0].status.addresses[?(@.type=="InternalIP")].address}',
        ]);
        ip = defaultOutput.trim();
        break;
      }
    }

    return {...clusterInfo, ip};
  } catch (error) {
    return {
      type: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
