import {execa} from 'execa';
import {
  DependencyStatus,
  ServiceStatus,
  StatusData,
  ModelStatus,
  CommandVersionConfig,
  K8sCondition,
  ClusterInfo,
} from '../lib/types.js';
import {checkCommandExists} from '../lib/commands.js';
import {arkServices} from '../arkServices.js';
import {isArkReady} from '../lib/arkStatus.js';

export const getNodeVersion = (): CommandVersionConfig => ({
  command: 'node',
  versionArgs: '--version',
  versionExtract: (output: string) => output.trim(),
});

export const getNpmVersion = (): CommandVersionConfig => ({
  command: 'npm',
  versionArgs: '--version',
  versionExtract: (output: string) => output.trim(),
});

export const getKubectlVersion = (): CommandVersionConfig => ({
  command: 'kubectl',
  versionArgs: 'version --client --output=json',
  versionExtract: (output: string) => {
    try {
      const versionInfo = JSON.parse(output);
      if (versionInfo.clientVersion) {
        return `v${versionInfo.clientVersion.major}.${versionInfo.clientVersion.minor}`;
      }
      throw new Error('kubectl version output missing clientVersion field');
    } catch (e) {
      throw new Error(
        `Failed to parse kubectl version JSON: ${e instanceof Error ? e.message : 'Unknown error'}`
      );
    }
  },
});

export const getDockerVersion = (): CommandVersionConfig => ({
  command: 'docker',
  versionArgs: '--version',
  versionExtract: (output: string) => output.trim(),
});

export const getHelmVersion = (): CommandVersionConfig => ({
  command: 'helm',
  versionArgs: 'version --short',
  versionExtract: (output: string) => output.trim(),
});

export const getMinikubeVersion = (): CommandVersionConfig => ({
  command: 'minikube',
  versionArgs: 'version --short',
  versionExtract: (output: string) => output.trim(),
});

export const getKindVersion = (): CommandVersionConfig => ({
  command: 'kind',
  versionArgs: 'version',
  versionExtract: (output: string) => {
    // kind version output is like "kind v0.20.0 go1.21.0 linux/amd64"
    const match = output.match(/kind (v[\d.]+)/);
    return match ? match[1] : output.trim();
  },
});

function createErrorServiceStatus(
  name: string,
  url: string,
  error: unknown,
  defaultStatus: 'unhealthy' | 'not installed' = 'unhealthy',
  defaultDetails?: string
): ServiceStatus {
  const errorMessage =
    error instanceof Error ? error.message : 'Unknown error occurred';
  return {
    name,
    status: defaultStatus,
    url,
    details: defaultDetails || `Error: ${errorMessage}`,
  };
}

export class StatusChecker {
  /**
   * Get version of a command
   */
  private async getCommandVersion(
    config: CommandVersionConfig
  ): Promise<string> {
    try {
      const args = config.versionArgs.split(' ');
      const {stdout} = await execa(config.command, args);
      return config.versionExtract(stdout);
    } catch (error) {
      throw new Error(
        `Failed to get ${config.command} version: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check combined deployment and helm status
   * Gets health from deployment, version/revision from Helm
   */
  private async checkCombinedStatus(
    serviceName: string,
    deploymentName: string,
    helmReleaseName: string,
    namespace: string,
    devDeploymentName?: string
  ): Promise<ServiceStatus> {
    // Get deployment status for health
    const deploymentStatus = await this.checkDeploymentStatus(
      serviceName,
      deploymentName,
      namespace,
      devDeploymentName
    );

    // Try to get version info from Helm if it's a healthy deployment
    if (
      deploymentStatus.status === 'healthy' ||
      deploymentStatus.status === 'warning'
    ) {
      try {
        const {stdout} = await execa(
          'helm',
          ['list', '-n', namespace, '-o', 'json'],
          {timeout: 5000}
        );
        const releases = JSON.parse(stdout) as Array<{
          name: string;
          app_version?: string;
          revision?: string;
        }>;
        const release = releases.find((r) => r.name === helmReleaseName);

        if (release) {
          // Merge Helm version info into deployment status
          return {
            ...deploymentStatus,
            version: release.app_version,
            revision: release.revision,
          };
        }
      } catch {
        // If Helm check fails, return deployment status as-is
      }
    }

    return deploymentStatus;
  }

  /**
   * Check deployment status
   */
  private async checkDeploymentStatus(
    serviceName: string,
    deploymentName: string,
    namespace: string,
    devDeploymentName?: string
  ): Promise<ServiceStatus> {
    try {
      const {stdout} = await execa('kubectl', [
        'get',
        'deployment',
        deploymentName,
        '--namespace',
        namespace,
        '-o',
        'json',
      ]);
      const deployment = JSON.parse(stdout);

      const replicas = deployment.spec?.replicas || 0;
      const readyReplicas = deployment.status?.readyReplicas || 0;
      const availableReplicas = deployment.status?.availableReplicas || 0;

      // Check Kubernetes 'Available' condition - only 'available' deployments are healthy
      const availableCondition = deployment.status?.conditions?.find(
        (condition: K8sCondition) => condition.type === 'Available'
      );
      const isAvailable = availableCondition?.status === 'True';
      const allReplicasReady =
        readyReplicas === replicas && availableReplicas === replicas;

      // Determine status: not ready if 0 replicas, healthy if available and all ready, warning otherwise
      let status: 'healthy' | 'warning' | 'not ready';
      if (replicas === 0 || readyReplicas === 0) {
        status = 'not ready';
      } else if (isAvailable && allReplicasReady) {
        status = 'healthy';
      } else {
        status = 'warning';
      }

      // If main deployment has 0 replicas and we have a dev deployment, check it
      if (replicas === 0 && devDeploymentName) {
        try {
          const {stdout: devStdout} = await execa('kubectl', [
            'get',
            'deployment',
            devDeploymentName,
            '--namespace',
            namespace,
            '-o',
            'json',
          ]);
          const devDeployment = JSON.parse(devStdout);

          const devReplicas = devDeployment.spec?.replicas || 0;
          const devReadyReplicas = devDeployment.status?.readyReplicas || 0;
          const devAvailableReplicas =
            devDeployment.status?.availableReplicas || 0;

          if (devReplicas > 0) {
            const devAvailableCondition =
              devDeployment.status?.conditions?.find(
                (condition: K8sCondition) => condition.type === 'Available'
              );
            const devIsAvailable = devAvailableCondition?.status === 'True';
            const devAllReplicasReady =
              devReadyReplicas === devReplicas &&
              devAvailableReplicas === devReplicas;

            let devStatus: 'healthy' | 'warning' | 'not ready';
            if (devReplicas === 0 || devReadyReplicas === 0) {
              devStatus = 'not ready';
            } else if (devIsAvailable && devAllReplicasReady) {
              devStatus = 'healthy';
            } else {
              devStatus = 'warning';
            }

            return {
              name: serviceName,
              status: devStatus,
              details: `${devReadyReplicas}/${devReplicas} replicas ready`,
              isDev: true,
              namespace,
            };
          }
        } catch {
          // If dev deployment check fails, return the original status
        }
      }

      return {
        name: serviceName,
        status,
        details: `${readyReplicas}/${replicas} replicas ready`,
        namespace,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // If main deployment not found or not healthy, try dev deployment
      if (
        errorMessage.includes('not found') ||
        errorMessage.includes('NotFound')
      ) {
        if (devDeploymentName) {
          try {
            const {stdout} = await execa('kubectl', [
              'get',
              'deployment',
              devDeploymentName,
              '--namespace',
              namespace,
              '-o',
              'json',
            ]);
            const devDeployment = JSON.parse(stdout);

            const replicas = devDeployment.spec?.replicas || 0;
            const readyReplicas = devDeployment.status?.readyReplicas || 0;
            const availableReplicas =
              devDeployment.status?.availableReplicas || 0;

            const availableCondition = devDeployment.status?.conditions?.find(
              (condition: any) => condition.type === 'Available'
            );
            const isAvailable = availableCondition?.status === 'True';
            const allReplicasReady =
              readyReplicas === replicas && availableReplicas === replicas;

            let status: 'healthy' | 'warning' | 'not ready';
            if (replicas === 0 || readyReplicas === 0) {
              status = 'not ready';
            } else if (isAvailable && allReplicasReady) {
              status = 'healthy';
            } else {
              status = 'warning';
            }

            return {
              name: serviceName,
              status,
              details: `${readyReplicas}/${replicas} replicas ready`,
              isDev: true,
              namespace,
            };
          } catch {
            // If dev deployment also not found, return not installed
            return {
              name: serviceName,
              status: 'not installed',
              details: `Deployment '${deploymentName}' not found`,
              namespace,
            };
          }
        }

        return {
          name: serviceName,
          status: 'not installed',
          details: `Deployment '${deploymentName}' not found`,
          namespace,
        };
      }

      return createErrorServiceStatus(
        serviceName,
        '',
        error,
        'unhealthy',
        `Failed to check deployment: ${errorMessage}`
      );
    }
  }

  /**
   * Check helm release status (fallback for services without deployments)
   */
  private async checkHelmStatus(
    serviceName: string,
    helmReleaseName: string,
    namespace: string
  ): Promise<ServiceStatus> {
    try {
      const {stdout} = await execa('helm', [
        'list',
        '--filter',
        helmReleaseName,
        '--namespace',
        namespace,
        '--output',
        'json',
      ]);
      const helmList = JSON.parse(stdout);

      if (helmList.length === 0) {
        return {
          name: serviceName,
          status: 'not installed',
          details: `Helm release '${helmReleaseName}' not found`,
          namespace,
        };
      }

      const release = helmList[0];
      const status = release.status?.toLowerCase() || 'unknown';
      const revision = release.revision || 'unknown';
      const appVersion = release.app_version || 'unknown';

      const isHealthy = status === 'deployed';

      return {
        name: serviceName,
        status: isHealthy ? 'healthy' : 'unhealthy',
        version: appVersion,
        revision: revision,
        details: `Status: ${status}`,
        namespace,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return createErrorServiceStatus(
        serviceName,
        '',
        error,
        'unhealthy',
        `Failed to check helm status: ${errorMessage}`
      );
    }
  }

  /**
   * Check system dependencies
   */
  private async checkDependencies(): Promise<DependencyStatus[]> {
    const dependencies = [
      {name: 'node', ...getNodeVersion()},
      {name: 'npm', ...getNpmVersion()},
      {name: 'kubectl', ...getKubectlVersion()},
      {name: 'docker', ...getDockerVersion()},
      {name: 'helm', ...getHelmVersion()},
      {name: 'minikube', ...getMinikubeVersion()},
      {name: 'kind', ...getKindVersion()},
    ];

    const results: DependencyStatus[] = [];

    for (const dep of dependencies) {
      const args = dep.versionArgs.split(' ');
      const installed = await checkCommandExists(dep.command, args);
      const version = installed
        ? await this.getCommandVersion({
            command: dep.command,
            versionArgs: dep.versionArgs,
            versionExtract: dep.versionExtract,
          })
        : undefined;
      results.push({
        name: dep.name,
        installed,
        version,
        details: installed
          ? `Found ${dep.name} ${version}`
          : `${dep.name} not found in PATH`,
      });
    }
    return results;
  }

  /**
   * Run all checks and return results
   */
  public async checkAll(): Promise<
    StatusData & {clusterAccess: boolean; clusterInfo?: ClusterInfo}
  > {
    // Check dependencies first
    const dependencies = await this.checkDependencies();

    // Test cluster access
    let clusterAccess = false;
    try {
      await execa('kubectl', ['get', 'namespaces', '-o', 'name'], {
        timeout: 5000,
      });
      clusterAccess = true;
    } catch {
      clusterAccess = false;
    }

    // Get cluster info if accessible
    let clusterInfo;
    if (clusterAccess) {
      const {getClusterInfo} = await import('../lib/cluster.js');
      clusterInfo = await getClusterInfo();
    }

    let services: ServiceStatus[] = [];

    // Only check ARK services if we have cluster access
    if (clusterAccess) {
      const serviceChecks: Promise<ServiceStatus>[] = [];

      for (const [serviceName, service] of Object.entries(arkServices)) {
        // Skip disabled services
        if (!service.enabled) continue;

        // Use service namespace if defined, otherwise use current namespace from clusterInfo
        const namespace =
          service.namespace || clusterInfo?.namespace || 'default';

        if (service.k8sDeploymentName) {
          // For deployments, get health from deployment and version from Helm
          serviceChecks.push(
            this.checkCombinedStatus(
              serviceName,
              service.k8sDeploymentName,
              service.helmReleaseName,
              namespace,
              service.k8sDevDeploymentName
            )
          );
        } else {
          serviceChecks.push(
            this.checkHelmStatus(
              serviceName,
              service.helmReleaseName,
              namespace
            )
          );
        }
      }

      services = await Promise.all(serviceChecks);
    }

    // Check if ARK is ready (controller is running)
    let arkReady = false;
    let defaultModelExists = false;
    let defaultModel: ModelStatus | undefined;

    if (clusterAccess) {
      arkReady = await isArkReady();

      // Check for default model with detailed status
      if (arkReady) {
        try {
          const {stdout} = await execa('kubectl', [
            'get',
            'model',
            'default',
            '-o',
            'json',
          ]);
          const model = JSON.parse(stdout);
          defaultModelExists = true;

          // Extract model details
          const available =
            model.status?.conditions?.find(
              (c: K8sCondition) => c.type === 'ModelAvailable'
            )?.status === 'True';

          defaultModel = {
            exists: true,
            available,
            provider: model.spec?.provider,
            details: model.spec?.model || model.spec?.apiEndpoint,
          };
        } catch {
          defaultModelExists = false;
          defaultModel = {
            exists: false,
          };
        }
      }
    }

    return {
      services,
      dependencies,
      clusterAccess,
      clusterInfo,
      arkReady,
      defaultModelExists,
      defaultModel,
    };
  }
}
