import {execa} from 'execa';
import output from '../../../lib/output.js';
import {ProviderConfig} from '../providers/index.js';

const SECRET_LABELS = {
  'ark.mckinsey.com/resource-type': 'secret',
  'ark.mckinsey.com/scope': 'shared',
};

function secretData(
  config: ProviderConfig
): Record<string, string | undefined> {
  if (config.type !== 'bedrock') {
    return {'api-key': config.apiKey, token: config.apiKey};
  }
  if (config.authMethod === 'api-key') {
    return {'bedrock-api-key': config.apiKey};
  }
  return {
    'access-key-id': config.accessKeyId,
    'secret-access-key': config.secretAccessKey,
    'session-token': config.sessionToken || undefined,
  };
}

export function buildSecretManifest(config: ProviderConfig) {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {name: config.secretName, labels: SECRET_LABELS},
    type: 'Opaque',
    stringData: secretData(config),
  };
}

// Secret manager interface
export interface SecretManager {
  createSecret(config: ProviderConfig): Promise<void>;
}

type ExistingSecret = {
  metadata: {labels?: Record<string, string>; managedFields?: unknown};
  data?: Record<string, string>;
};

export function mergeIntoExisting(
  existing: ExistingSecret,
  config: ProviderConfig
) {
  const manifest = buildSecretManifest(config);
  const data = {...existing.data};
  for (const key of Object.keys(manifest.stringData)) {
    delete data[key];
  }
  const metadata = {...existing.metadata};
  delete metadata.managedFields;
  return {
    ...existing,
    metadata: {...metadata, labels: {...metadata.labels, ...SECRET_LABELS}},
    data,
    stringData: manifest.stringData,
  };
}

// Kubernetes secret manager implementation
export class KubernetesSecretManager implements SecretManager {
  async createSecret(config: ProviderConfig): Promise<void> {
    const existing = await this.readSecret(config.secretName);
    const manifest = existing
      ? mergeIntoExisting(existing, config)
      : buildSecretManifest(config);

    await execa('kubectl', [existing ? 'replace' : 'create', '-f', '-'], {
      input: JSON.stringify(manifest),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    output.success(
      `${existing ? 'updated' : 'created'} secret ${config.secretName}`
    );
  }

  private async readSecret(secretName: string): Promise<ExistingSecret | null> {
    try {
      const {stdout} = await execa(
        'kubectl',
        ['get', 'secret', secretName, '-o', 'json'],
        {stdio: 'pipe'}
      );
      return JSON.parse(stdout);
    } catch {
      return null;
    }
  }
}
