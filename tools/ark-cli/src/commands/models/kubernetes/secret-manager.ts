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

// Kubernetes secret manager implementation
export class KubernetesSecretManager implements SecretManager {
  async createSecret(config: ProviderConfig): Promise<void> {
    const secretExists = await this.secretExists(config.secretName);

    await execa('kubectl', [secretExists ? 'replace' : 'create', '-f', '-'], {
      input: JSON.stringify(buildSecretManifest(config)),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    output.success(
      `${secretExists ? 'updated' : 'created'} secret ${config.secretName}`
    );
  }

  private async secretExists(secretName: string): Promise<boolean> {
    try {
      await execa('kubectl', ['get', 'secret', secretName], {stdio: 'pipe'});
      return true;
    } catch {
      return false;
    }
  }
}
