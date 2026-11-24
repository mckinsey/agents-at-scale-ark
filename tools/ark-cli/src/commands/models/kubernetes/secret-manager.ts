import {execa} from 'execa';
import output from '../../../lib/output.js';
import {ProviderConfig} from '../providers/index.js';

const SCOPE_LABEL = 'ark.mckinsey.com/scope';
const SHARED_SCOPE = 'shared';
const RESERVED_USER_PREFIX = /^u-[0-9a-f]{16}-/;

const SECRET_LABELS = {
  'ark.mckinsey.com/resource-type': 'secret',
  [SCOPE_LABEL]: SHARED_SCOPE,
};

export class SecretScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretScopeError';
  }
}

export function reservedNameError(name: string): string | undefined {
  if (RESERVED_USER_PREFIX.test(name)) {
    return `${name} starts with u-<16 hex>-, a prefix Ark reserves for personal secrets`;
  }
  return undefined;
}

const MANAGED_KEYS = [
  'api-key',
  'token',
  'bedrock-api-key',
  'access-key-id',
  'secret-access-key',
  'session-token',
];

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
  for (const key of MANAGED_KEYS) {
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
    const reserved = reservedNameError(config.secretName);
    if (reserved) {
      throw new SecretScopeError(reserved);
    }
    const existing = await this.readSecret(config.secretName);
    const scope = existing?.metadata.labels?.[SCOPE_LABEL];
    if (scope && scope !== SHARED_SCOPE) {
      throw new SecretScopeError(
        `secret ${config.secretName} is a personal secret and is left as it is; choose another model name`
      );
    }
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
