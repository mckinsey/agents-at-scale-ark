import { generateMcpProxyYaml } from '@/lib/utils/mcp-template-generator';
import { describe, expect, it } from 'vitest';

describe('generateMcpProxyYaml', () => {
  it('generates correct YAML for stdio configuration', () => {
    const yaml = generateMcpProxyYaml({
      name: 'test-server',
      namespace: 'test-ns',
      image: 'node:lts-alpine',
      command: ['npx'],
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      env: {
        DEBUG: 'true'
      }
    });

    expect(yaml).toContain('kind: Deployment');
    expect(yaml).toContain('name: test-server');
    expect(yaml).toContain('namespace: test-ns');
    expect(yaml).toContain('ghcr.io/anthropics/mcpproxy:latest');
    expect(yaml).toContain('image: node:lts-alpine');
    expect(yaml).toContain('/mcp-bin/mcpproxy');
    expect(yaml).toContain('--stdio');
    expect(yaml).toContain(
      'npx -y @modelcontextprotocol/server-filesystem /tmp',
    );
    expect(yaml).toContain('name: DEBUG');
    expect(yaml).toContain('value: "true"');
    expect(yaml).toContain('transport: sse');
  });

  it('generates correct service and mcpserver resource', () => {
    const yaml = generateMcpProxyYaml({
      name: 'foo',
      namespace: 'bar',
      image: 'foo:latest',
      command: ['foo'],
      args: [],
    });

    expect(yaml).toContain('kind: Service');
    expect(yaml).toContain('kind: MCPServer');
    expect(yaml).toContain('address:');
    expect(yaml).toContain('value: http://foo.bar.svc.cluster.local:80/sse');
  });
});
