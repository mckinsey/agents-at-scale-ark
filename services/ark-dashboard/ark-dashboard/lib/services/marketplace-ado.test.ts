import { describe, expect, it } from 'vitest';

import { ADO_FIELD_DEFAULTS, buildAdoUrl } from './marketplace-ado';

describe('buildAdoUrl', () => {
  it('builds the raw-fetch URL with the given fields', () => {
    const url = buildAdoUrl({
      org: 'my-org',
      project: 'my-project',
      repo: 'my-repo',
      branch: 'main',
      path: '/marketplace.json',
    });

    expect(url).toBe(
      'https://dev.azure.com/my-org/my-project/_apis/git/repositories/my-repo/items' +
        '?path=/marketplace.json&api-version=7.1&$format=text' +
        '&versionDescriptor.version=main&versionDescriptor.versionType=branch',
    );
  });

  it('returns null when a required field is missing', () => {
    expect(buildAdoUrl({ ...ADO_FIELD_DEFAULTS, org: '', project: 'p', repo: 'r' })).toBeNull();
    expect(buildAdoUrl({ ...ADO_FIELD_DEFAULTS, org: 'o', project: '', repo: 'r' })).toBeNull();
    expect(buildAdoUrl({ ...ADO_FIELD_DEFAULTS, org: 'o', project: 'p', repo: '' })).toBeNull();
  });

  it('returns null when branch or path are cleared', () => {
    expect(
      buildAdoUrl({ org: 'o', project: 'p', repo: 'r', branch: '', path: '/marketplace.json' }),
    ).toBeNull();
    expect(buildAdoUrl({ org: 'o', project: 'p', repo: 'r', branch: 'main', path: '' })).toBeNull();
  });

  it('url-encodes org, project, repo and path segments with special characters', () => {
    const url = buildAdoUrl({
      org: 'my org',
      project: 'proj/ect',
      repo: 'repo name',
      branch: 'main',
      path: '/marketplace.json',
    });

    expect(url).toContain('/my%20org/');
    expect(url).toContain('/proj%2Fect/');
    expect(url).toContain('/repo%20name/');
  });

  it('supports a branch containing slashes', () => {
    const url = buildAdoUrl({
      org: 'o',
      project: 'p',
      repo: 'r',
      branch: 'feature/foo',
      path: '/marketplace.json',
    });

    expect(url).toContain('versionDescriptor.version=feature%2Ffoo');
  });

  it('supports a custom nested path and adds a leading slash if missing', () => {
    const url = buildAdoUrl({
      org: 'o',
      project: 'p',
      repo: 'r',
      branch: 'main',
      path: 'configs/marketplace.json',
    });

    expect(url).toContain('path=/configs/marketplace.json');
  });
});
