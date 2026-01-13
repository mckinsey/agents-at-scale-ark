import { APIClient } from '@/lib/api/client';

const proxyApiClient = new APIClient('/api/v1/proxy/services');

export interface ServiceListResponse {
  services: string[];
}

export const proxyService = {
  async listServices(): Promise<ServiceListResponse> {
    return proxyApiClient.get<ServiceListResponse>('');
  },

  async isServiceAvailable(serviceName: string): Promise<boolean> {
    const response = await this.listServices();
    return response.services.includes(serviceName);
  },
};
