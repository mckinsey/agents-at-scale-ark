import { APIClient } from '@/lib/api/client';

const proxyApiClient = new APIClient('/api/v1/proxy/services');

export interface ServiceListResponse {
  services: string[];
}

export type BrokerStatus = 'available' | 'not-installed' | 'not-running';

export const proxyService = {
  async listServices(): Promise<ServiceListResponse> {
    return proxyApiClient.get<ServiceListResponse>('');
  },

  async isServiceAvailable(serviceName: string): Promise<boolean> {
    const response = await this.listServices();
    return response.services.includes(serviceName);
  },

  async checkBrokerHealth(): Promise<BrokerStatus> {
    const installed = await this.isServiceAvailable('ark-broker');
    if (!installed) {
      return 'not-installed';
    }
    try {
      const res = await fetch('/api/v1/proxy/services/ark-broker/health');
      if (res.ok) {
        return 'available';
      }
      return 'not-running';
    } catch {
      return 'not-running';
    }
  },
};
