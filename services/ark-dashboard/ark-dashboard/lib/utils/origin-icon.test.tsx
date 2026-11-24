import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getOriginIcon, getOriginLabel } from './origin-icon';

describe('getOriginLabel', () => {
  it('returns ARK when origin is undefined', () => {
    expect(getOriginLabel(undefined)).toBe('ARK');
  });

  it('returns ARK when origin is null', () => {
    expect(getOriginLabel(null)).toBe('ARK');
  });

  it('returns ARK when origin is an empty string', () => {
    expect(getOriginLabel('')).toBe('ARK');
  });

  it('maps a github type to GitHub', () => {
    expect(getOriginLabel(JSON.stringify({ type: 'github' }))).toBe('GitHub');
  });

  it('maps a marketplace type to Marketplace', () => {
    expect(getOriginLabel(JSON.stringify({ type: 'marketplace' }))).toBe(
      'Marketplace',
    );
  });

  it('capitalizes an unmapped type', () => {
    expect(getOriginLabel(JSON.stringify({ type: 'gitlab' }))).toBe('Gitlab');
  });

  it('returns ARK when the parsed object has no type', () => {
    expect(getOriginLabel(JSON.stringify({ foo: 'bar' }))).toBe('ARK');
  });

  it('returns ARK when origin is not valid JSON', () => {
    expect(getOriginLabel('not-json')).toBe('ARK');
  });
});

describe('getOriginIcon', () => {
  it('renders a github icon for a github type in metadata mode', () => {
    const { container } = render(
      <>{getOriginIcon(JSON.stringify({ type: 'github' }))}</>,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('returns null for a non-github type in metadata mode', () => {
    expect(getOriginIcon(JSON.stringify({ type: 'marketplace' }))).toBeNull();
  });

  it('returns null for invalid JSON in metadata mode', () => {
    expect(getOriginIcon('not-json')).toBeNull();
  });

  it('returns null when origin is undefined', () => {
    expect(getOriginIcon(undefined)).toBeNull();
  });

  it('renders a github icon for a github URL in repository mode', () => {
    const { container } = render(
      <>{getOriginIcon('https://github.com/org/repo', 'repository')}</>,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('returns null for a non-github URL in repository mode', () => {
    expect(getOriginIcon('https://example.com/repo', 'repository')).toBeNull();
  });
});
