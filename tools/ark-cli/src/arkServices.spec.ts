import {
  arkDependencies,
  arkServices,
  getInstallableServices,
} from './arkServices.js';

describe('arkServices', () => {
  it('exports arkDependencies with expected structure', () => {
    expect(arkDependencies).toBeDefined();
    expect(arkDependencies['cert-manager']).toBeDefined();
    expect(arkDependencies['cert-manager'].command).toBe('helm');
  });

  it('exports arkServices with expected structure', () => {
    expect(arkServices).toBeDefined();
    expect(arkServices['ark-controller']).toBeDefined();
    expect(arkServices['ark-controller'].namespace).toBe('ark-system');
    // User services should have undefined namespace (use current context)
    expect(arkServices['ark-api'].namespace).toBeUndefined();
    expect(arkServices['ark-dashboard'].namespace).toBeUndefined();
    // System services should have explicit namespace
    expect(arkServices['localhost-gateway'].namespace).toBe('ark-system');
  });

  it('getInstallableServices returns services with chartPath', () => {
    const installable = getInstallableServices();

    expect(installable['ark-controller']).toBeDefined();
    expect(installable['ark-api']).toBeDefined();
    expect(installable['ark-api-a2a']).toBeUndefined(); // no chartPath
  });
});
