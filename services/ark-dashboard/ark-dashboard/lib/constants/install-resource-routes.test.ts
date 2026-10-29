import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  INSTALL_RESOURCE_ROUTES,
  getInstallResourceHref,
  getInstallResourceLinkLabel,
} from './install-resource-routes';

const DASHBOARD_ROUTE_ROOT = join(process.cwd(), 'app', '(dashboard)');

describe('INSTALL_RESOURCE_ROUTES', () => {
  it('points every kind at a route that exists in the app router', () => {
    const missing: string[] = [];

    for (const kind of Object.keys(INSTALL_RESOURCE_ROUTES)) {
      const href = getInstallResourceHref(kind, 'probe-name');
      expect(href).toBeDefined();

      const segments = (href as string).replace(/^\//, '').split('/');
      const base = segments[0];
      const tail = segments.slice(2);

      // Find the dynamic segment directory, e.g. [name] or [mcp_id].
      const candidates = ['[name]', '[mcp_id]', '[model_id]', '[id]'];
      const resolved = candidates.some(dynamic =>
        existsSync(
          join(DASHBOARD_ROUTE_ROOT, base, dynamic, ...tail, 'page.tsx'),
        ),
      );

      if (!resolved) {
        missing.push(`${kind} -> ${href}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it('encodes the name so it cannot escape its path segment', () => {
    expect(getInstallResourceHref('Agent', '../../evil')).toBe(
      '/agents/..%2F..%2Fevil',
    );
    expect(getInstallResourceHref('Agent', 'a/b?c=d#e')).toBe(
      '/agents/a%2Fb%3Fc%3Dd%23e',
    );
  });

  it('returns nothing for a kind that has no page', () => {
    expect(getInstallResourceHref('ConfigMap', 'x')).toBeUndefined();
    expect(getInstallResourceHref('Secret', 'x')).toBeUndefined();
  });

  it('labels studio-backed kinds differently', () => {
    expect(getInstallResourceLinkLabel('Agent')).toBe('Open in studio');
    expect(getInstallResourceLinkLabel('Team')).toBe('Open in studio');
    expect(getInstallResourceLinkLabel('Model')).toBe('Open');
  });
});
