import {spawn, ChildProcess} from 'child_process';
import find from 'find-process';
import Debug from 'debug';
import {ArkService} from '../arkServices.js';

const debug = Debug('ark:service-proxy');

export class ArkServiceProxy {
  private kubectlProcess?: ChildProcess;
  private localPort: number;
  private isReady: boolean = false;
  private service: ArkService;

  constructor(
    service: ArkService,
    localPort?: number,
    private reusePortForwards: boolean = false
  ) {
    this.service = service;
    this.localPort =
      localPort || service.k8sPortForwardLocalPort || this.getRandomPort();
  }

  private getRandomPort(): number {
    return Math.floor(Math.random() * (65535 - 1024) + 1024);
  }

  private async checkExistingPortForward(): Promise<boolean> {
    try {
      const processes = await find('port', this.localPort);

      if (processes.length === 0) {
        return false;
      }

      const kubectlProcess = processes.find(
        (proc) =>
          proc.cmd?.includes('kubectl') && proc.cmd?.includes('port-forward')
      );

      if (kubectlProcess) {
        debug(
          `Reusing existing kubectl port-forward on port ${this.localPort} (PID: ${kubectlProcess.pid})`
        );
        this.isReady = true;
        return true;
      }

      const processInfo = processes[0];
      throw new Error(
        `${this.service.name} port forward failed: port ${this.localPort} is already in use by ${processInfo.name} (PID: ${processInfo.pid})`
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('already in use')) {
        throw error;
      }
      debug(`Error checking for existing port-forward: ${error}`);
      return false;
    }
  }

  async start(): Promise<string> {
    if (!this.service.k8sServiceName || !this.service.k8sServicePort) {
      throw new Error(
        `${this.service.name} service configuration missing k8sServiceName or k8sServicePort`
      );
    }

    if (this.reusePortForwards) {
      const isReused = await this.checkExistingPortForward();
      if (isReused) {
        return `http://localhost:${this.localPort}`;
      }
    }

    return new Promise((resolve, reject) => {
      const args = [
        'port-forward',
        `service/${this.service.k8sServiceName}`,
        `${this.localPort}:${this.service.k8sServicePort}`,
      ];

      // Add namespace flag only if namespace is defined
      if (this.service.namespace) {
        args.push('--namespace', this.service.namespace);
      }

      this.kubectlProcess = spawn('kubectl', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let setupComplete = false;

      const setupTimeout = setTimeout(() => {
        if (!setupComplete) {
          this.stop();
          reject(new Error(`${this.service.name} port forward setup timeout`));
        }
      }, 10000);

      this.kubectlProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Forwarding from') && !setupComplete) {
          setupComplete = true;
          clearTimeout(setupTimeout);
          this.isReady = true;

          const localUrl = `http://localhost:${this.localPort}`;
          resolve(localUrl);
        }
      });

      this.kubectlProcess.stderr?.on('data', (data) => {
        const errorOutput = data.toString();
        if (!setupComplete) {
          setupComplete = true;
          clearTimeout(setupTimeout);
          this.stop();

          reject(
            new Error(
              `${this.service.name} port forward failed: ${errorOutput.trim()}`
            )
          );
        }
      });

      this.kubectlProcess.on('error', (error) => {
        if (!setupComplete) {
          setupComplete = true;
          clearTimeout(setupTimeout);
          reject(
            new Error(
              `Failed to start ${this.service.name} port forward: ${error.message}`
            )
          );
        }
      });

      this.kubectlProcess.on('exit', (code) => {
        this.isReady = false;
        if (!setupComplete && code !== 0) {
          setupComplete = true;
          clearTimeout(setupTimeout);
          reject(
            new Error(
              `${this.service.name} port forward exited with code ${code}`
            )
          );
        }
      });
    });
  }

  stop(): void {
    if (this.kubectlProcess) {
      // Use SIGTERM for graceful shutdown
      this.kubectlProcess.kill('SIGTERM');
      // Give it a second to clean up, then force kill if needed
      setTimeout(() => {
        if (this.kubectlProcess && !this.kubectlProcess.killed) {
          this.kubectlProcess.kill('SIGKILL');
        }
      }, 1000);
      this.kubectlProcess = undefined;
    }
    this.isReady = false;
  }

  isRunning(): boolean {
    return this.isReady && this.kubectlProcess !== undefined;
  }

  getLocalUrl(): string {
    return `http://localhost:${this.localPort}`;
  }

  getService(): ArkService {
    return this.service;
  }
}
