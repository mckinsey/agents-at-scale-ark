import {vi} from 'vitest';
import type {ProviderConfig} from '../providers/index.js';

const mockExeca = vi.fn() as any;
vi.mock('execa', () => ({
  execa: mockExeca,
}));

const mockOutput = {
  success: vi.fn(),
};
vi.mock('../../../lib/output.js', () => ({
  default: mockOutput,
}));

const {KubernetesSecretManager} = await import('./secret-manager.js');

const LABELS = {
  'ark.mckinsey.com/resource-type': 'secret',
  'ark.mckinsey.com/scope': 'shared',
};

const openai: ProviderConfig = {
  type: 'openai',
  modelValue: 'gpt-4o',
  secretName: 'm-model-secret',
  baseUrl: 'https://api.openai.com',
  apiKey: 'sk-openai',
};

const EXISTING = {
  apiVersion: 'v1',
  kind: 'Secret',
  metadata: {
    name: 'm-model-secret',
    resourceVersion: '42',
    labels: {'ark.mckinsey.com/label.prod': 'true', app: 'gitops'},
    annotations: {'ark.mckinsey.com/description': 'shared key'},
    managedFields: [{manager: 'kubectl'}],
  },
  type: 'Opaque',
  data: {token: 'b2xk', 'api-key': 'b2xk', extra: 'a2VlcA=='},
};

async function run(
  config: ProviderConfig,
  secretExists: boolean,
  existing: object = EXISTING
) {
  if (secretExists) {
    mockExeca.mockResolvedValueOnce({stdout: JSON.stringify(existing)});
  } else {
    mockExeca.mockRejectedValueOnce(new Error('not found'));
  }
  mockExeca.mockResolvedValueOnce({});
  await new KubernetesSecretManager().createSecret(config);
  const [, args, options] = mockExeca.mock.calls.at(-1);
  return {args, manifest: JSON.parse(options.input)};
}

describe('KubernetesSecretManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new secret from a labelled manifest on stdin', async () => {
    const {args, manifest} = await run(openai, false);

    expect(args).toEqual(['create', '-f', '-']);
    expect(manifest).toEqual({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {name: 'm-model-secret', labels: LABELS},
      type: 'Opaque',
      stringData: {'api-key': 'sk-openai', token: 'sk-openai'},
    });
    expect(mockOutput.success).toHaveBeenCalledWith(
      'created secret m-model-secret'
    );
  });

  it('replaces an existing secret and keeps its metadata and other keys', async () => {
    const {args, manifest} = await run(openai, true);

    expect(args).toEqual(['replace', '-f', '-']);
    expect(manifest.metadata).toEqual({
      name: 'm-model-secret',
      resourceVersion: '42',
      labels: {...EXISTING.metadata.labels, ...LABELS},
      annotations: EXISTING.metadata.annotations,
    });
    expect(manifest.data).toEqual({extra: 'a2VlcA=='});
    expect(manifest.stringData).toEqual({
      'api-key': 'sk-openai',
      token: 'sk-openai',
    });
    expect(mockOutput.success).toHaveBeenCalledWith(
      'updated secret m-model-secret'
    );
  });

  it('drops a stale session token when the new config has none', async () => {
    const {manifest} = await run(
      {
        type: 'bedrock',
        modelValue: 'claude',
        secretName: 's',
        region: 'us-east-1',
        authMethod: 'iam',
        accessKeyId: 'AKIA',
        secretAccessKey: 'secret',
        sessionToken: '',
      },
      true,
      {...EXISTING, data: {'session-token': 'b2xk', 'access-key-id': 'b2xk'}}
    );

    expect(manifest.data).toEqual({});
    expect(manifest.stringData).toEqual({
      'access-key-id': 'AKIA',
      'secret-access-key': 'secret',
    });
  });

  it('never puts secret values in argv or uses apply', async () => {
    await run(openai, true);
    await run(openai, false);

    for (const [, args] of mockExeca.mock.calls) {
      expect(args).not.toContain('apply');
      expect(args.join(' ')).not.toContain('sk-openai');
      expect(args.join(' ')).not.toContain('--from-literal');
    }
  });

  it.each([
    [
      'azure',
      {
        type: 'azure',
        modelValue: 'gpt-4o',
        secretName: 's',
        baseUrl: 'https://azure',
        apiVersion: '2024-12-01',
        apiKey: 'az-key',
      },
      {'api-key': 'az-key', token: 'az-key'},
    ],
    [
      'bedrock api-key',
      {
        type: 'bedrock',
        modelValue: 'claude',
        secretName: 's',
        region: 'us-east-1',
        authMethod: 'api-key',
        apiKey: 'br-key',
      },
      {'bedrock-api-key': 'br-key'},
    ],
    [
      'bedrock IAM with session token',
      {
        type: 'bedrock',
        modelValue: 'claude',
        secretName: 's',
        region: 'us-east-1',
        authMethod: 'iam',
        accessKeyId: 'AKIA',
        secretAccessKey: 'secret',
        sessionToken: 'session',
      },
      {
        'access-key-id': 'AKIA',
        'secret-access-key': 'secret',
        'session-token': 'session',
      },
    ],
    [
      'bedrock IAM without session token',
      {
        type: 'bedrock',
        modelValue: 'claude',
        secretName: 's',
        region: 'us-east-1',
        authMethod: 'iam',
        accessKeyId: 'AKIA',
        secretAccessKey: 'secret',
        sessionToken: '',
      },
      {'access-key-id': 'AKIA', 'secret-access-key': 'secret'},
    ],
  ] as [string, ProviderConfig, Record<string, string>][])(
    'writes the %s keys',
    async (_name, config, stringData) => {
      const {manifest} = await run(config, false);

      expect(manifest.stringData).toEqual(stringData);
      expect(manifest.metadata.labels).toEqual(LABELS);
    }
  );
});
