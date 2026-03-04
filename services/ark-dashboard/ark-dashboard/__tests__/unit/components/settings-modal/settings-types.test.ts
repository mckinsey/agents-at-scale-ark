import { describe, expect, it } from 'vitest';

import { settingsSections } from '@/components/settings-modal/settings-types';

describe('settingsSections', () => {
  it('should have two sections', () => {
    expect(settingsSections).toHaveLength(2);
  });

  it('should have general section with correct items', () => {
    const general = settingsSections.find(s => s.sectionKey === 'general');
    expect(general).toBeDefined();
    expect(general!.sectionLabel).toBe('General');
    expect(general!.items).toHaveLength(5);
    expect(general!.items.map(i => i.key)).toEqual([
      'a2a-servers',
      'ark-services',
      'memory',
      'manage-marketplace',
      'experimental-features',
    ]);
  });

  it('should have privacy section with correct items', () => {
    const privacy = settingsSections.find(s => s.sectionKey === 'privacy');
    expect(privacy).toBeDefined();
    expect(privacy!.sectionLabel).toBe('Privacy');
    expect(privacy!.items).toHaveLength(2);
    expect(privacy!.items.map(i => i.key)).toEqual([
      'service-api-keys',
      'secrets',
    ]);
  });

  it('should have icons for all items', () => {
    for (const section of settingsSections) {
      for (const item of section.items) {
        expect(item.icon).toBeDefined();
      }
    }
  });
});
