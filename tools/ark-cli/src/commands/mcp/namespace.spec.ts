import {vi} from 'vitest';

const mockKubeConfig = {
  loadFromDefault: vi.fn(),
  getCurrentContext: vi.fn(),
  getContextObject: vi.fn(),
};

vi.mock('@kubernetes/client-node', () => ({
  KubeConfig: vi.fn(function () {
    return mockKubeConfig;
  }),
}));

const {resolveNamespace} = await import('./namespace.js');

describe('resolveNamespace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns explicit value when provided', () => {
    expect(resolveNamespace('explicit-ns')).toBe('explicit-ns');
    expect(mockKubeConfig.loadFromDefault).not.toHaveBeenCalled();
  });

  it('falls back to active context namespace when explicit is undefined', () => {
    mockKubeConfig.getCurrentContext.mockReturnValue('ctx-1');
    mockKubeConfig.getContextObject.mockReturnValue({namespace: 'kube-ns'});
    expect(resolveNamespace()).toBe('kube-ns');
    expect(mockKubeConfig.loadFromDefault).toHaveBeenCalledOnce();
  });

  it('falls back to default when context has no namespace', () => {
    mockKubeConfig.getCurrentContext.mockReturnValue('ctx-1');
    mockKubeConfig.getContextObject.mockReturnValue({namespace: undefined});
    expect(resolveNamespace()).toBe('default');
  });

  it('falls back to default when no current context is set', () => {
    mockKubeConfig.getCurrentContext.mockReturnValue('');
    expect(resolveNamespace()).toBe('default');
  });

  it('falls back to default when context object is missing', () => {
    mockKubeConfig.getCurrentContext.mockReturnValue('ctx-1');
    mockKubeConfig.getContextObject.mockReturnValue(undefined);
    expect(resolveNamespace()).toBe('default');
  });

  it('explicit empty string is treated as not provided', () => {
    mockKubeConfig.getCurrentContext.mockReturnValue('ctx-1');
    mockKubeConfig.getContextObject.mockReturnValue({namespace: 'kube-ns'});
    expect(resolveNamespace('')).toBe('kube-ns');
  });
});
