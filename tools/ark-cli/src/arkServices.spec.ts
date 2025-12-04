import {jest} from '@jest/globals';

const mockLoadConfig = jest.fn();
const mockGetMarketplaceRegistry = jest.fn();

jest.unstable_mockModule('./lib/config.js', () => ({
  loadConfig: mockLoadConfig,
  getMarketplaceRegistry: mockGetMarketplaceRegistry,
}));

mockLoadConfig.mockReturnValue({});
mockGetMarketplaceRegistry.mockReturnValue('oci://test-registry/charts');

const {
  arkDependencies,
  arkServices: originalArkServices,
  getInstallableServices,
} = await import('./arkServices.js');

describe('arkServices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadConfig.mockReturnValue({});
    mockGetMarketplaceRegistry.mockReturnValue('oci://test-registry/charts');
  });

  it('exports arkDependencies with expected structure', () => {
    expect(arkDependencies).toBeDefined();
    expect(arkDependencies['cert-manager']).toBeDefined();
    expect(arkDependencies['cert-manager'].command).toBe('helm');
  });

  it('exports arkServices with expected structure', () => {
    expect(originalArkServices).toBeDefined();
    expect(originalArkServices['ark-controller']).toBeDefined();
    expect(originalArkServices['ark-controller'].namespace).toBe('ark-system');
    expect(originalArkServices['ark-api'].namespace).toBeUndefined();
    expect(originalArkServices['ark-dashboard'].namespace).toBeUndefined();
    expect(originalArkServices['localhost-gateway'].namespace).toBe(
      'ark-system'
    );
  });

  it('getInstallableServices returns services with chartPath', () => {
    const installable = getInstallableServices();

    expect(installable['ark-controller']).toBeDefined();
    expect(installable['ark-api']).toBeDefined();
    expect(installable['ark-api-a2a']).toBeUndefined();
  });

  describe('applyConfigOverrides', () => {
    it('applies no overrides when config has no services section', async () => {
      mockLoadConfig.mockReturnValue({});

      jest.resetModules();
      const {arkServices} = await import('./arkServices.js');

      expect(arkServices['ark-controller'].enabled).toBe(true);
      expect(arkServices['ark-api'].enabled).toBe(true);
    });

    it('applies overrides to enable a disabled service', async () => {
      mockLoadConfig.mockReturnValue({
        services: {
          'localhost-gateway': {enabled: true},
        },
      });

      jest.resetModules();
      const {arkServices} = await import('./arkServices.js');

      expect(arkServices['localhost-gateway'].enabled).toBe(true);
    });

    it('applies overrides to disable an enabled service', async () => {
      mockLoadConfig.mockReturnValue({
        services: {
          'ark-controller': {enabled: false},
        },
      });

      jest.resetModules();
      const {arkServices} = await import('./arkServices.js');

      expect(arkServices['ark-controller'].enabled).toBe(false);
    });

    it('applies overrides to multiple services', async () => {
      mockLoadConfig.mockReturnValue({
        services: {
          'ark-controller': {enabled: false},
          'ark-api': {enabled: false},
          'localhost-gateway': {enabled: true},
        },
      });

      jest.resetModules();
      const {arkServices} = await import('./arkServices.js');

      expect(arkServices['ark-controller'].enabled).toBe(false);
      expect(arkServices['ark-api'].enabled).toBe(false);
      expect(arkServices['localhost-gateway'].enabled).toBe(true);
    });

    it('applies overrides to namespace', async () => {
      mockLoadConfig.mockReturnValue({
        services: {
          'ark-api': {namespace: 'custom-namespace'},
        },
      });

      jest.resetModules();
      const {arkServices} = await import('./arkServices.js');

      expect(arkServices['ark-api'].namespace).toBe('custom-namespace');
    });

    it('applies overrides to chartPath', async () => {
      mockLoadConfig.mockReturnValue({
        services: {
          'ark-controller': {
            chartPath: 'oci://custom-registry/charts/ark-controller',
          },
        },
      });

      jest.resetModules();
      const {arkServices} = await import('./arkServices.js');

      expect(arkServices['ark-controller'].chartPath).toBe(
        'oci://custom-registry/charts/ark-controller'
      );
    });

    it('applies partial overrides without affecting other properties', async () => {
      mockLoadConfig.mockReturnValue({
        services: {
          'ark-controller': {enabled: false},
        },
      });

      jest.resetModules();
      const {arkServices} = await import('./arkServices.js');

      expect(arkServices['ark-controller'].enabled).toBe(false);
      expect(arkServices['ark-controller'].namespace).toBe('ark-system');
      expect(arkServices['ark-controller'].category).toBe('core');
      expect(arkServices['ark-controller'].description).toBe(
        'Core Ark controller for managing AI resources'
      );
    });

    it('applies overrides to installArgs', async () => {
      mockLoadConfig.mockReturnValue({
        services: {
          'ark-controller': {installArgs: ['--set', 'custom.value=true']},
        },
      });

      jest.resetModules();
      const {arkServices} = await import('./arkServices.js');

      expect(arkServices['ark-controller'].installArgs).toEqual([
        '--set',
        'custom.value=true',
      ]);
    });

    it('does not affect services without overrides', async () => {
      mockLoadConfig.mockReturnValue({
        services: {
          'ark-controller': {enabled: false},
        },
      });

      jest.resetModules();
      const {arkServices} = await import('./arkServices.js');

      expect(arkServices['ark-api'].enabled).toBe(true);
      expect(arkServices['ark-dashboard'].enabled).toBe(true);
    });
  });
});
