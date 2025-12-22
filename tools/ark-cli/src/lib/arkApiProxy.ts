import {ArkApiClient} from './arkApiClient.js';
import {ArkServiceProxy} from './arkServiceProxy.js';
import {arkServices} from '../arkServices.js';

export class ArkApiProxy {
  private serviceProxy: ArkServiceProxy;

  constructor(localPort?: number, reusePortForwards: boolean = false) {
    const arkApiService = arkServices['ark-api'];
    this.serviceProxy = new ArkServiceProxy(
      arkApiService,
      localPort,
      reusePortForwards
    );
  }

  async start(): Promise<ArkApiClient> {
    const arkApiUrl = await this.serviceProxy.start();
    return new ArkApiClient(arkApiUrl);
  }

  stop(): void {
    this.serviceProxy.stop();
  }

  isRunning(): boolean {
    return this.serviceProxy.isRunning();
  }

  getLocalUrl(): string {
    return this.serviceProxy.getLocalUrl();
  }
}
