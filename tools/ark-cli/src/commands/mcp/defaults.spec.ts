import {vi} from 'vitest';

const mockLoadConfig = vi.fn();
vi.mock('../../lib/config.js', () => ({loadConfig: mockLoadConfig}));

const mockStart = vi.fn();
const mockStop = vi.fn();
const mockGetBaseUrl = vi.fn();

class FakeArkApiProxy {
  constructor(
    public localPort?: number,
    public reuse: boolean = false
  ) {}
  start = vi.fn().mockResolvedValue({getBaseUrl: mockGetBaseUrl});
  stop = mockStop;
}

vi.mock('../../lib/arkApiProxy.js', () => ({
  ArkApiProxy: vi.fn(function (p?: number, r?: boolean) {
    const inst = new FakeArkApiProxy(p, r);
    mockStart.mockImplementation(inst.start);
    return inst;
  }),
}));

const mockResolveNamespace = vi.fn();
vi.mock('./namespace.js', () => ({resolveNamespace: mockResolveNamespace}));

const mockOpen = vi.fn();
vi.mock('open', () => ({default: mockOpen}));

const {defaultDeps} = await import('./login.js');
const {defaultLogoutDeps} = await import('./logout.js');
const {ArkApiProxy} = await import('../../lib/arkApiProxy.js');

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBaseUrl.mockReturnValue('http://localhost:9999');
});

describe('login defaultDeps', () => {
  it('startProxy returns baseUrl and stop, honoring reusePortForwards: true', async () => {
    mockLoadConfig.mockReturnValue({services: {reusePortForwards: true}});
    const result = await defaultDeps.startProxy();
    expect(result.baseUrl).toBe('http://localhost:9999');
    expect(ArkApiProxy).toHaveBeenCalledWith(undefined, true);

    result.stop();
    expect(mockStop).toHaveBeenCalledOnce();
  });

  it('startProxy defaults reusePortForwards to false when missing', async () => {
    mockLoadConfig.mockReturnValue({});
    await defaultDeps.startProxy();
    expect(ArkApiProxy).toHaveBeenCalledWith(undefined, false);
  });

  it('startProxy defaults reusePortForwards to false when services.reusePortForwards is undefined', async () => {
    mockLoadConfig.mockReturnValue({services: {}});
    await defaultDeps.startProxy();
    expect(ArkApiProxy).toHaveBeenCalledWith(undefined, false);
  });

  it('buildClient returns an McpAuthClient bound to the given baseUrl', () => {
    const client = defaultDeps.buildClient('http://localhost:8080');
    expect(client).toBeDefined();
    expect(typeof (client as unknown as {start: unknown}).start).toBe(
      'function'
    );
  });

  it('openBrowser delegates to open()', async () => {
    mockOpen.mockResolvedValue(undefined);
    await defaultDeps.openBrowser('https://idp/example');
    expect(mockOpen).toHaveBeenCalledWith('https://idp/example');
  });

  it('resolveNs delegates to resolveNamespace', () => {
    mockResolveNamespace.mockReturnValue('resolved-ns');
    expect(defaultDeps.resolveNs('input-ns')).toBe('resolved-ns');
    expect(mockResolveNamespace).toHaveBeenCalledWith('input-ns');
  });

  it('sleep resolves after the requested delay', async () => {
    vi.useFakeTimers();
    const promise = defaultDeps.sleep(50);
    vi.advanceTimersByTime(60);
    await promise;
    vi.useRealTimers();
  });

  it('now returns a recent Date.now() value', () => {
    const before = Date.now();
    const observed = defaultDeps.now();
    const after = Date.now();
    expect(observed).toBeGreaterThanOrEqual(before);
    expect(observed).toBeLessThanOrEqual(after);
  });
});

describe('logout defaultLogoutDeps', () => {
  it('startProxy honors reusePortForwards: true from config', async () => {
    mockLoadConfig.mockReturnValue({services: {reusePortForwards: true}});
    const result = await defaultLogoutDeps.startProxy();
    expect(result.baseUrl).toBe('http://localhost:9999');
    expect(ArkApiProxy).toHaveBeenCalledWith(undefined, true);
    result.stop();
    expect(mockStop).toHaveBeenCalledOnce();
  });

  it('startProxy defaults to false when config is empty', async () => {
    mockLoadConfig.mockReturnValue({});
    await defaultLogoutDeps.startProxy();
    expect(ArkApiProxy).toHaveBeenCalledWith(undefined, false);
  });

  it('buildClient returns an McpAuthClient bound to the given baseUrl', () => {
    const client = defaultLogoutDeps.buildClient('http://localhost:8080');
    expect(client).toBeDefined();
    expect(typeof (client as unknown as {logout: unknown}).logout).toBe(
      'function'
    );
  });

  it('resolveNs delegates to resolveNamespace', () => {
    mockResolveNamespace.mockReturnValue('resolved-ns');
    expect(defaultLogoutDeps.resolveNs('input-ns')).toBe('resolved-ns');
    expect(mockResolveNamespace).toHaveBeenCalledWith('input-ns');
  });
});
