import {vi} from 'vitest';
import {Command} from 'commander';
import yaml from 'yaml';

const mockExeca = vi.fn() as any;
vi.mock('execa', () => ({
  execa: mockExeca,
}));

const mockWriteFile = vi.fn() as any;
vi.mock('fs/promises', () => ({
  writeFile: mockWriteFile,
}));

const mockOutput = {
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
};
vi.mock('../../lib/output.js', () => ({
  default: mockOutput,
}));

const _mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called');
}) as any);

const mockKubectlGetResponse = {
  apiVersion: 'v1',
  items: [{metadata: {name: 'test-resource'}, spec: 'foo'}],
  kind: 'List',
  metadata: {
    resourceVersion: '',
  },
};

const {createExportCommand} = await import('./index.js');
import type {ArkConfig} from '../../lib/config.js';

describe('export command', () => {
  const mockConfig: ArkConfig = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create export command with correct description', () => {
    const command = createExportCommand(mockConfig);

    expect(command).toBeInstanceOf(Command);
    expect(command.name()).toBe('export');
    expect(command.description()).toBe('export ARK resources to a file');
  });

  it('should export all resource types by default', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify(mockKubectlGetResponse),
    });

    mockWriteFile.mockResolvedValue(undefined);

    const command = createExportCommand(mockConfig);
    await command.parseAsync(['node', 'test', '-o', 'test.yaml']);

    const expectedResourceTypes = [
      'secrets',
      'tools',
      'models',
      'agents',
      'teams',
      'mcpservers',
      'a2aservers',
    ];

    expect(mockExeca).toHaveBeenCalledTimes(expectedResourceTypes.length);

    for (const resourceType of expectedResourceTypes) {
      expect(mockExeca).toHaveBeenCalledWith(
        'kubectl',
        expect.arrayContaining(['get', resourceType, '-o', 'json']),
        expect.any(Object)
      );
      expect(mockOutput.success).toHaveBeenCalledWith(
        `found 1 ${resourceType}`
      );
    }

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it('should export types specified in config in dependency order', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify(mockKubectlGetResponse),
    });

    mockWriteFile.mockResolvedValue(undefined);

    const newDefaultTypes = ['teams', 'agents'];
    const modifiedConfig: ArkConfig = {defaultExportTypes: newDefaultTypes};

    const command = createExportCommand(modifiedConfig);
    await command.parseAsync(['node', 'test', '-o', 'test.yaml']);

    expect(mockExeca.mock.calls).toEqual([
      [
        'kubectl',
        expect.arrayContaining(['get', 'agents']),
        expect.any(Object),
      ],
      ['kubectl', expect.arrayContaining(['get', 'teams']), expect.any(Object)],
    ]);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it('should filter by resource types when specified and export in order', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify(mockKubectlGetResponse),
    });

    mockWriteFile.mockResolvedValue(undefined);

    const command = createExportCommand(mockConfig);
    await command.parseAsync([
      'node',
      'test',
      '-t',
      'agents,models',
      '-o',
      'test.yaml',
    ]);

    expect(mockExeca.mock.calls).toEqual([
      [
        'kubectl',
        expect.arrayContaining(['get', 'models']),
        expect.any(Object),
      ],
      [
        'kubectl',
        expect.arrayContaining(['get', 'agents']),
        expect.any(Object),
      ],
    ]);
  });

  it('should use namespace filter when specified', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify(mockKubectlGetResponse),
    });

    mockWriteFile.mockResolvedValue(undefined);

    const command = createExportCommand(mockConfig);
    await command.parseAsync([
      'node',
      'test',
      '-n',
      'custom-namespace',
      '-t',
      'agents',
      '-o',
      'test.yaml',
    ]);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      expect.arrayContaining(['-n', 'custom-namespace']),
      expect.any(Object)
    );

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it('should use label selector when specified', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify(mockKubectlGetResponse),
    });

    mockWriteFile.mockResolvedValue(undefined);

    const command = createExportCommand(mockConfig);
    await command.parseAsync([
      'node',
      'test',
      '-l',
      'app=test',
      '-t',
      'agents',
      '-o',
      'test.yaml',
    ]);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      expect.arrayContaining(['-l', 'app=test']),
      expect.any(Object)
    );

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });

  it('should remove cluster-managed state from exported resources', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({
        items: [
          {
            apiVersion: 'ark.mckinsey.com/v1alpha1',
            kind: 'Agent',
            metadata: {
              name: 'test-agent',
              namespace: 'default',
              labels: {app: 'test'},
              annotations: {
                'kubectl.kubernetes.io/last-applied-configuration': '{}',
                note: 'keep-me',
              },
              resourceVersion: '10',
              uid: 'source-uid',
              generation: 3,
              creationTimestamp: '2026-01-01T00:00:00Z',
              managedFields: [{manager: 'controller'}],
              selfLink: '/apis/ark.mckinsey.com/v1alpha1/agents/test-agent',
              deletionTimestamp: '2026-01-02T00:00:00Z',
              deletionGracePeriodSeconds: 30,
              ownerReferences: [{name: 'source-owner', uid: 'owner-uid'}],
              finalizers: ['ark.mckinsey.com/finalizer'],
            },
            spec: {prompt: '', enabled: false, maxTurns: 0},
            status: {phase: 'Ready'},
          },
        ],
      }),
    });
    mockWriteFile.mockResolvedValue(undefined);

    const command = createExportCommand(mockConfig);
    await command.parseAsync([
      'node',
      'test',
      '-t',
      'agents',
      '-o',
      'test.yaml',
    ]);

    const yamlContent = mockWriteFile.mock.calls[0][1] as string;
    const exported = yaml.parse(yamlContent);

    expect(exported).toEqual({
      apiVersion: 'ark.mckinsey.com/v1alpha1',
      kind: 'Agent',
      metadata: {
        name: 'test-agent',
        namespace: 'default',
        labels: {app: 'test'},
        annotations: {note: 'keep-me'},
      },
      spec: {prompt: '', enabled: false, maxTurns: 0},
    });
    expect(mockWriteFile).toHaveBeenCalledWith(
      'test.yaml',
      expect.any(String),
      'utf-8'
    );
  });

  it('should remove annotations when only last-applied remains', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({
        items: [
          {
            apiVersion: 'ark.mckinsey.com/v1alpha1',
            kind: 'Agent',
            metadata: {
              name: 'test-agent',
              annotations: {
                'kubectl.kubernetes.io/last-applied-configuration': '{}',
              },
            },
            spec: {prompt: 'test'},
          },
        ],
      }),
    });
    mockWriteFile.mockResolvedValue(undefined);

    const command = createExportCommand(mockConfig);
    await command.parseAsync(['node', 'test', '-t', 'agents']);

    const yamlContent = mockWriteFile.mock.calls[0][1] as string;
    expect(yaml.parse(yamlContent).metadata).toEqual({name: 'test-agent'});
  });

  it('should exclude system secrets and retain application secrets', async () => {
    const secretNames = [
      'sh.helm.release.v1.ark-api.v1',
      'helm-type-only',
      'sh.helm.release.v1.application.v1',
      'service-account-token',
      'application-tls',
    ];
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({
        items: [
          {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: {name: secretNames[0]},
            type: 'helm.sh/release.v1',
            data: {release: 'encoded-release'},
          },
          {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: {name: secretNames[1]},
            type: 'helm.sh/release.v1',
            data: {key: 'retained'},
          },
          {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: {
              name: secretNames[2],
              resourceVersion: '42',
              uid: 'secret-uid',
              creationTimestamp: '2026-01-01T00:00:00Z',
              managedFields: [{manager: 'controller'}],
              annotations: {
                'kubectl.kubernetes.io/last-applied-configuration': '{}',
              },
            },
            type: 'Opaque',
            stringData: {token: 'retained'},
          },
          {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: {name: secretNames[3]},
            type: 'kubernetes.io/service-account-token',
            data: {token: 'encoded-token'},
          },
          {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: {name: secretNames[4]},
            type: 'kubernetes.io/tls',
            immutable: true,
            data: {'tls.crt': 'certificate', 'tls.key': 'private-key'},
          },
        ],
      }),
    });
    mockWriteFile.mockResolvedValue(undefined);

    const command = createExportCommand(mockConfig);
    await command.parseAsync([
      'node',
      'test',
      '-t',
      'secrets',
      '-o',
      'secrets.yaml',
    ]);

    const yamlContent = mockWriteFile.mock.calls[0][1] as string;
    const exported = yaml
      .parseAllDocuments(yamlContent)
      .map((document) => document.toJSON());

    expect(exported.map((resource) => resource.metadata.name)).toEqual([
      secretNames[1],
      secretNames[2],
      secretNames[4],
    ]);
    expect(exported[1]).toMatchObject({
      metadata: {name: secretNames[2]},
      type: 'Opaque',
      stringData: {token: 'retained'},
    });
    expect(exported[1].metadata).toEqual({name: secretNames[2]});
    expect(exported[2]).toMatchObject({
      type: 'kubernetes.io/tls',
      immutable: true,
      data: {'tls.crt': 'certificate', 'tls.key': 'private-key'},
    });
    expect(mockOutput.info).toHaveBeenCalledWith(
      'excluded 2 system-managed secrets'
    );
    expect(mockOutput.success).toHaveBeenCalledWith(
      'exported 3 resources to secrets.yaml'
    );

    const outputMessages = [
      ...mockOutput.info.mock.calls,
      ...mockOutput.success.mock.calls,
      ...mockOutput.warning.mock.calls,
    ]
      .flat()
      .join(' ');
    for (const secretName of secretNames) {
      expect(outputMessages).not.toContain(secretName);
    }
  });

  it('should exclude controller-managed children and retain their parents', async () => {
    mockExeca
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          items: [
            {
              apiVersion: 'ark.mckinsey.com/v1alpha1',
              kind: 'Tool',
              metadata: {
                name: 'managed-tool-by-label',
                labels: {'mcp/server': 'test-mcp'},
              },
              spec: {type: 'mcp'},
            },
            {
              apiVersion: 'ark.mckinsey.com/v1alpha1',
              kind: 'Tool',
              metadata: {
                name: 'managed-tool-by-owner',
                ownerReferences: [
                  {
                    apiVersion: 'ark.mckinsey.com/v1alpha1',
                    kind: 'MCPServer',
                    name: 'test-mcp',
                    uid: 'mcp-uid',
                  },
                ],
              },
              spec: {type: 'mcp'},
            },
            {
              apiVersion: 'ark.mckinsey.com/v1alpha1',
              kind: 'Tool',
              metadata: {name: 'user-tool'},
              spec: {type: 'http'},
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          items: [
            {
              apiVersion: 'ark.mckinsey.com/v1alpha1',
              kind: 'Agent',
              metadata: {
                name: 'managed-agent-by-label',
                labels: {'a2a/server': 'test-a2a'},
              },
              spec: {prompt: 'managed'},
            },
            {
              apiVersion: 'ark.mckinsey.com/v1alpha1',
              kind: 'Agent',
              metadata: {
                name: 'managed-agent-by-owner',
                ownerReferences: [
                  {
                    apiVersion: 'ark.mckinsey.com/v1prealpha1',
                    kind: 'A2AServer',
                    name: 'test-a2a',
                    uid: 'a2a-uid',
                  },
                ],
              },
              spec: {prompt: 'managed'},
            },
            {
              apiVersion: 'ark.mckinsey.com/v1alpha1',
              kind: 'Agent',
              metadata: {name: 'user-agent'},
              spec: {prompt: 'user'},
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          items: [
            {
              apiVersion: 'ark.mckinsey.com/v1alpha1',
              kind: 'MCPServer',
              metadata: {name: 'test-mcp'},
              spec: {transport: 'http'},
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          items: [
            {
              apiVersion: 'ark.mckinsey.com/v1prealpha1',
              kind: 'A2AServer',
              metadata: {name: 'test-a2a'},
              spec: {description: 'test'},
            },
          ],
        }),
      });
    mockWriteFile.mockResolvedValue(undefined);

    const command = createExportCommand(mockConfig);
    await command.parseAsync([
      'node',
      'test',
      '-t',
      'a2aservers,tools,mcpservers,agents',
      '-o',
      'managed-resources.yaml',
    ]);

    const yamlContent = mockWriteFile.mock.calls[0][1] as string;
    const exported = yaml
      .parseAllDocuments(yamlContent)
      .map((document) => document.toJSON());

    expect(exported.map((resource) => resource.metadata.name)).toEqual([
      'user-tool',
      'user-agent',
      'test-mcp',
      'test-a2a',
    ]);
    expect(mockOutput.info).toHaveBeenCalledWith(
      'excluded 4 controller-managed resources'
    );
    expect(mockOutput.success).toHaveBeenCalledWith(
      'exported 4 resources to managed-resources.yaml'
    );
  });

  it('should not write output when all resources are controller-managed', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({
        items: [
          {
            apiVersion: 'ark.mckinsey.com/v1alpha1',
            kind: 'Tool',
            metadata: {
              name: 'managed-tool-by-label',
              labels: {'mcp/server': 'test-mcp'},
            },
            spec: {type: 'mcp'},
          },
        ],
      }),
    });
    mockWriteFile.mockResolvedValue(undefined);

    const command = createExportCommand(mockConfig);
    await command.parseAsync([
      'node',
      'test',
      '-t',
      'tools',
      '-o',
      'managed-tools.yaml',
    ]);

    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockOutput.info).toHaveBeenCalledWith(
      'excluded 1 controller-managed resource'
    );
    expect(mockOutput.warning).toHaveBeenCalledWith(
      'no resources found to export'
    );
  });

  it('should not write output when all resources are excluded', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({
        items: [
          {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: {name: 'default-token'},
            type: 'kubernetes.io/service-account-token',
            data: {token: 'encoded-token'},
          },
        ],
      }),
    });
    mockWriteFile.mockResolvedValue(undefined);

    const command = createExportCommand(mockConfig);
    await command.parseAsync([
      'node',
      'test',
      '-t',
      'secrets',
      '-o',
      'existing.yaml',
    ]);

    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockOutput.info).toHaveBeenCalledWith(
      'excluded 1 system-managed secret'
    );
    expect(mockOutput.warning).toHaveBeenCalledWith(
      'no resources found to export'
    );
  });

  it('should warn and skip unknown resource types', async () => {
    const command = createExportCommand(mockConfig);
    await command.parseAsync(['node', 'test', '-t', 'unknown']);

    expect(mockExeca).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockOutput.warning).toHaveBeenCalledWith(
      'unknown resource type: unknown, skipping'
    );
    expect(mockOutput.warning).toHaveBeenCalledWith(
      'no resources found to export'
    );
  });

  it('fails if kubectl get fails for a resource type', async () => {
    mockExeca.mockRejectedValue('Export broke');

    const command = createExportCommand(mockConfig);
    await command.parseAsync(['node', 'test']);

    expect(mockOutput.error).toHaveBeenCalledWith(
      'export failed:',
      'Export broke'
    );
  });
});
