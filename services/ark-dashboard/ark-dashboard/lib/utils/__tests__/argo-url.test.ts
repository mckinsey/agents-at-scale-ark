import { describe, expect, it } from 'vitest';

import { createArgoLinks, normalizeArgoUrl } from '@/lib/utils/argo-url';

describe('normalizeArgoUrl', () => {
  it('returns undefined when unset', () => {
    expect(normalizeArgoUrl(undefined)).toBeUndefined();
  });

  it('treats empty and whitespace-only values as unset', () => {
    expect(normalizeArgoUrl('')).toBeUndefined();
    expect(normalizeArgoUrl('   ')).toBeUndefined();
  });

  it('trims whitespace and trailing slashes', () => {
    expect(normalizeArgoUrl(' https://argo.example.com// ')).toBe(
      'https://argo.example.com',
    );
  });

  it('keeps a path prefix', () => {
    expect(normalizeArgoUrl('https://example.com/argo/')).toBe(
      'https://example.com/argo',
    );
  });
});

describe('createArgoLinks', () => {
  it('returns undefined when no base URL is configured', () => {
    expect(createArgoLinks(undefined)).toBeUndefined();
  });

  it('builds workflow template links', () => {
    expect(
      createArgoLinks('https://argo.example.com')?.workflowTemplate(
        'default',
        'my-template',
      ),
    ).toBe('https://argo.example.com/workflow-templates/default/my-template');
  });

  it('builds workflow links without a query', () => {
    expect(
      createArgoLinks('https://argo.example.com')?.workflow('default', 'run-1'),
    ).toBe('https://argo.example.com/workflows/default/run-1');
  });

  it('encodes namespace and name path segments', () => {
    expect(
      createArgoLinks('https://argo.example.com')?.workflowTemplate(
        'team a',
        'tpl/1',
      ),
    ).toBe('https://argo.example.com/workflow-templates/team%20a/tpl%2F1');
  });

  it('builds workflow links with query params in order', () => {
    expect(
      createArgoLinks('https://argo.example.com')?.workflow(
        'default',
        'run-1',
        {
          tab: 'workflow',
          nodeId: 'run-1-123',
        },
      ),
    ).toBe(
      'https://argo.example.com/workflows/default/run-1?tab=workflow&nodeId=run-1-123',
    );
  });
});
