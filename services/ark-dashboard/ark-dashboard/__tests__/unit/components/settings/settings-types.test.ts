import { describe, expect, it } from 'vitest';

import { settingsSections } from '@/components/settings/settings-types';

describe('settingsSections', () => {
  it('should have one section', () => {
    expect(settingsSections).toHaveLength(1);
  });

  it('should have settings section with correct items', () => {
    const settings = settingsSections.find(s => s.sectionKey === 'settings');
    expect(settings).toBeDefined();
    expect(settings!.sectionLabel).toBe('');
    expect(settings!.items).toHaveLength(3);
    expect(settings!.items.map(i => i.key)).toEqual([
      'queries',
      'experimental-features',
      'execution-engines',
    ]);
  });

  it('should mark execution-engines as experimental', () => {
    const settings = settingsSections.find(s => s.sectionKey === 'settings');
    const executionEngines = settings!.items.find(
      i => i.key === 'execution-engines',
    );
    expect(executionEngines).toBeDefined();
    expect(executionEngines!.experimental).toBe(true);
  });

  it('should have icons for all items', () => {
    for (const section of settingsSections) {
      for (const item of section.items) {
        expect(item.icon).toBeDefined();
      }
    }
  });
});
