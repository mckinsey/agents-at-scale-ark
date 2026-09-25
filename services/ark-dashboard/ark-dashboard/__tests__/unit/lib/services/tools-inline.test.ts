import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import {
  TOOL_PENDING_MESSAGES,
  summarizeToolStatus,
  toolsService,
} from '@/lib/services/tools';

vi.mock('@/lib/api/client');
vi.mock('@/lib/analytics/singleton', () => ({ trackEvent: vi.fn() }));

describe('toolsService inline authoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends inline source and language on create', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(undefined);

    await toolsService.create('team-a', {
      name: 'csv',
      type: 'inline',
      description: 'count rows',
      inputSchema: '{"type":"object"}',
      inlineSource: 'print(1)',
      inlineLanguage: 'python',
    });

    expect(post).toHaveBeenCalledWith(
      '/api/v1/tools',
      expect.objectContaining({
        name: 'csv',
        namespace: 'team-a',
        spec: expect.objectContaining({
          type: 'inline',
          inline: { source: 'print(1)', language: 'python' },
        }),
      }),
      { params: { namespace: 'team-a' } },
    );
  });

  it('preserves source whitespace exactly', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(undefined);
    const source = '\n  print(1)  \n\n';

    await toolsService.create('team-a', {
      name: 'csv',
      type: 'inline',
      description: 'd',
      inlineSource: source,
      inlineLanguage: 'python',
    });

    const payload = post.mock.calls[0][1] as {
      spec: { inline: { source: string } };
    };
    expect(payload.spec.inline.source).toBe(source);
  });

  it('omits inline for non-inline types', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(undefined);

    await toolsService.create('team-a', {
      name: 'fetch',
      type: 'http',
      description: 'd',
      url: 'https://example.com',
      inlineSource: 'print(1)',
      inlineLanguage: 'python',
    });

    const payload = post.mock.calls[0][1] as { spec: Record<string, unknown> };
    expect(payload.spec.inline).toBeUndefined();
    expect(payload.spec.http).toEqual({ url: 'https://example.com' });
  });

  it('persists edits through PUT', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue(undefined);

    await toolsService.update('team-a', 'csv', {
      type: 'inline',
      description: 'count rows',
      inputSchema: '{"type":"object"}',
      inlineSource: 'print(2)',
      inlineLanguage: 'bash',
    });

    expect(put).toHaveBeenCalledWith(
      '/api/v1/tools/csv',
      expect.objectContaining({
        spec: expect.objectContaining({
          type: 'inline',
          inline: { source: 'print(2)', language: 'bash' },
        }),
      }),
      { params: { namespace: 'team-a' } },
    );
  });
});

describe('summarizeToolStatus', () => {
  it('returns nothing useful for a missing status', () => {
    expect(summarizeToolStatus(undefined)).toEqual({});
  });

  it('reads the Available condition and its reason', () => {
    const summary = summarizeToolStatus({
      state: 'Pending',
      conditions: [
        {
          type: 'Available',
          status: 'False',
          reason: 'RuntimeNotInstalled',
          message: 'runtime missing',
        },
      ],
    });
    expect(summary.available).toBe(false);
    expect(summary.reason).toBe('RuntimeNotInstalled');
    expect(summary.message).toBe('runtime missing');
    expect(summary.state).toBe('Pending');
  });

  it('reports available when the condition is True', () => {
    const summary = summarizeToolStatus({
      state: 'Ready',
      conditions: [{ type: 'Available', status: 'True', reason: 'Available' }],
    });
    expect(summary.available).toBe(true);
  });

  it('ignores unrelated conditions', () => {
    const summary = summarizeToolStatus({
      conditions: [{ type: 'Something', status: 'True' }],
    });
    expect(summary.available).toBeUndefined();
  });

  it('distinguishes the pending reasons an operator must act on', () => {
    expect(TOOL_PENDING_MESSAGES.RuntimeNotInstalled).toContain(
      'not installed',
    );
    expect(TOOL_PENDING_MESSAGES.ConflictingNetworkPolicy).toContain(
      'administrator',
    );
    expect(TOOL_PENDING_MESSAGES.ActivatorUnavailable).toContain('activator');
    expect(TOOL_PENDING_MESSAGES.ProvisioningFailed).toBeTruthy();
  });
});
