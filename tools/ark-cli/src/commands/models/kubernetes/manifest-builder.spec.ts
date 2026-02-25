import {KubernetesModelManifestBuilder} from './manifest-builder.js';
import type {AzureConfig} from '../providers/azure.js';

describe('KubernetesModelManifestBuilder', () => {
  const modelName = 'test-model';

  describe('Azure config', () => {
    it('builds manifest with apiKey auth (default)', () => {
      const builder = new KubernetesModelManifestBuilder(modelName);
      const config: AzureConfig = {
        type: 'azure',
        modelValue: 'gpt-4o',
        baseUrl: 'https://my-azure.openai.azure.com',
        apiVersion: '2024-02-15-preview',
        secretName: 'my-azure-secret',
      };
      const manifest = builder.build(config);
      expect(manifest).toMatchObject({
        apiVersion: 'ark.mckinsey.com/v1alpha1',
        kind: 'Model',
        metadata: {name: modelName},
        spec: {
          provider: 'azure',
          model: {value: 'gpt-4o'},
          config: {
            azure: {
              baseUrl: {value: config.baseUrl},
              apiVersion: {value: config.apiVersion},
              auth: {
                apiKey: {
                  valueFrom: {
                    secretKeyRef: {
                      name: 'my-azure-secret',
                      key: 'api-key',
                    },
                  },
                },
              },
            },
          },
        },
      });
    });

    it('builds manifest with apiKey auth and default secret name when omitted', () => {
      const builder = new KubernetesModelManifestBuilder(modelName);
      const config: AzureConfig = {
        type: 'azure',
        modelValue: 'gpt-4o',
        baseUrl: 'https://my-azure.openai.azure.com',
        apiVersion: '2024-02-15-preview',
        secretName: '',
      };
      const manifest = builder.build(config);
      const azure = (manifest.spec as any).config.azure;
      expect(azure.auth.apiKey.valueFrom.secretKeyRef.name).toBe(
        'azure-openai-secret'
      );
      expect(azure.auth.apiKey.valueFrom.secretKeyRef.key).toBe('api-key');
    });

    it('builds manifest with managedIdentity auth (no clientId)', () => {
      const builder = new KubernetesModelManifestBuilder(modelName);
      const config: AzureConfig = {
        type: 'azure',
        modelValue: 'gpt-4o',
        baseUrl: 'https://my-azure.openai.azure.com',
        apiVersion: '2024-02-15-preview',
        authMethod: 'managedIdentity',
        secretName: '',
      };
      const manifest = builder.build(config);
      expect((manifest.spec as any).config.azure).toMatchObject({
        baseUrl: {value: config.baseUrl},
        apiVersion: {value: config.apiVersion},
        auth: {
          managedIdentity: {},
        },
      });
    });

    it('builds manifest with managedIdentity auth and clientId', () => {
      const builder = new KubernetesModelManifestBuilder(modelName);
      const config: AzureConfig = {
        type: 'azure',
        modelValue: 'gpt-4o',
        baseUrl: 'https://my-azure.openai.azure.com',
        apiVersion: '2024-02-15-preview',
        authMethod: 'managedIdentity',
        clientId: 'user-assigned-client-id',
        secretName: '',
      };
      const manifest = builder.build(config);
      expect((manifest.spec as any).config.azure).toMatchObject({
        baseUrl: {value: config.baseUrl},
        apiVersion: {value: config.apiVersion},
        auth: {
          managedIdentity: {
            clientId: {value: 'user-assigned-client-id'},
          },
        },
      });
    });

    it('builds manifest with workloadIdentity auth', () => {
      const builder = new KubernetesModelManifestBuilder(modelName);
      const config: AzureConfig = {
        type: 'azure',
        modelValue: 'gpt-4o',
        baseUrl: 'https://my-azure.openai.azure.com',
        apiVersion: '2024-02-15-preview',
        authMethod: 'workloadIdentity',
        clientId: 'wi-client-id',
        tenantId: 'wi-tenant-id',
        secretName: '',
      };
      const manifest = builder.build(config);
      expect((manifest.spec as any).config.azure).toMatchObject({
        baseUrl: {value: config.baseUrl},
        apiVersion: {value: config.apiVersion},
        auth: {
          workloadIdentity: {
            clientId: {value: 'wi-client-id'},
            tenantId: {value: 'wi-tenant-id'},
          },
        },
      });
    });
  });
});
