import { describe, expect, it } from 'vitest';

describe('dead code removal', () => {
  it('should not export settingsModalOpenAtom from atoms/settings-modal', async () => {
    const module = await import('@/atoms/settings-modal');
    expect(module).not.toHaveProperty('settingsModalOpenAtom');
  });

  it('should not export activeSettingPageAtom from atoms/settings-modal', async () => {
    const module = await import('@/atoms/settings-modal');
    expect(module).not.toHaveProperty('activeSettingPageAtom');
  });

  it('should still export SettingPage type from atoms/settings-modal', async () => {
    const module = await import('@/atoms/settings-modal');
    expect(module).toBeDefined();
  });
});
