import { render } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

import { SettingsKeyboardShortcut } from '@/components/settings-modal/settings-keyboard-shortcut';

describe('SettingsKeyboardShortcut', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
    });
  });

  it('should navigate to /settings when Cmd+E is pressed', () => {
    render(<SettingsKeyboardShortcut />);

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'e',
        metaKey: true,
        bubbles: true,
      }),
    );

    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('should navigate to /settings when Ctrl+E is pressed', () => {
    render(<SettingsKeyboardShortcut />);

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'e',
        ctrlKey: true,
        bubbles: true,
      }),
    );

    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('should not navigate when E is pressed without modifier', () => {
    render(<SettingsKeyboardShortcut />);

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'e',
        bubbles: true,
      }),
    );

    expect(mockPush).not.toHaveBeenCalled();
  });
});
