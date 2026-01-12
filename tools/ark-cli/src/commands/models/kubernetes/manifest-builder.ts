import {BedrockConfig, ProviderConfig} from '../providers/index.js';

// Model manifest builder interface
export interface ModelManifestBuilder {
  build(config: ProviderConfig): Record<string, unknown>;
}

// Kubernetes model manifest builder
export class KubernetesModelManifestBuilder implements ModelManifestBuilder {
  constructor(private modelName: string) {}

  build(config: ProviderConfig): Record<string, unknown> {
    const manifest = {
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Model',
      metadata: {
        name: this.modelName,
      },
      spec: {
        provider: config.type,  // Use provider field (required as of v0.50.0)
        model: {
          value: config.modelValue,
        },
        config: {} as Record<string, unknown>,
      },
    };

    manifest.spec.config = this.buildProviderConfig(config);
    return manifest;
  }

  private buildProviderConfig(config: ProviderConfig): Record<string, unknown> {
    if (config.type === 'azure') {
      return {
        azure: {
          apiKey: {
            valueFrom: {
              secretKeyRef: {
                name: config.secretName,
                key: 'api-key',
              },
            },
          },
          baseUrl: {
            value: config.baseUrl,
          },
          apiVersion: {
            value: config.apiVersion,
          },
        },
      };
    }

    if (config.type === 'bedrock') {
      return this.buildBedrockConfig(config);
    }

    if (config.type === 'openai') {
      return {
        openai: {
          apiKey: {
            valueFrom: {
              secretKeyRef: {
                name: config.secretName,
                key: 'api-key',
              },
            },
          },
          baseUrl: {
            value: config.baseUrl,
          },
        },
      };
    }

    throw new Error(
      `Unknown provider type: ${(config as ProviderConfig).type}`
    );
  }

  private buildBedrockConfig(config: BedrockConfig): Record<string, unknown> {
    const bedrockConfig: Record<string, unknown> = {
      bedrock: {
        region: {
          value: config.region,
        },
        accessKeyId: {
          valueFrom: {
            secretKeyRef: {
              name: config.secretName,
              key: 'access-key-id',
            },
          },
        },
        secretAccessKey: {
          valueFrom: {
            secretKeyRef: {
              name: config.secretName,
              key: 'secret-access-key',
            },
          },
        },
      },
    };

    const bedrock = bedrockConfig.bedrock as Record<string, unknown>;

    if (config.sessionToken) {
      bedrock.sessionToken = {
        valueFrom: {
          secretKeyRef: {
            name: config.secretName,
            key: 'session-token',
          },
        },
      };
    }

    if (config.modelArn) {
      bedrock.modelArn = {
        value: config.modelArn,
      };
    }

    return bedrockConfig;
  }
}
