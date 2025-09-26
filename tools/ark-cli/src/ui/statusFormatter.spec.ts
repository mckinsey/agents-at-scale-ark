import {describe, it, expect, jest, beforeEach, afterEach} from '@jest/globals';
import {StatusFormatter, StatusSection} from './statusFormatter.js';

describe('StatusFormatter', () => {
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prints sections', () => {
    const sections: StatusSection[] = [
      {
        title: 'Test Section',
        lines: [{icon: '✓', status: 'ok', name: 'test'}],
      },
    ];

    StatusFormatter.printSections(sections);

    expect(consoleLogSpy).toHaveBeenCalled();
    const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c?.includes('Test Section'))).toBe(true);
    expect(calls.some((c) => c?.includes('✓ ok'))).toBe(true);
  });

  it('prints line with details', () => {
    const sections: StatusSection[] = [
      {
        title: 'Test',
        lines: [{icon: '✓', status: 'ok', name: 'test', details: 'v1.0.0'}],
      },
    ];

    StatusFormatter.printSections(sections);

    const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c?.includes('v1.0.0'))).toBe(true);
  });

  it('prints subtext', () => {
    const sections: StatusSection[] = [
      {
        title: 'Test',
        lines: [
          {icon: '✗', status: 'error', name: 'test', subtext: 'Try again'},
        ],
      },
    ];

    StatusFormatter.printSections(sections);

    const calls = consoleLogSpy.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c?.includes('Try again'))).toBe(true);
  });

  it('adds spacing between sections', () => {
    const sections: StatusSection[] = [
      {title: 'First', lines: []},
      {title: 'Second', lines: []},
    ];

    StatusFormatter.printSections(sections);

    const calls = consoleLogSpy.mock.calls;
    // Should have blank lines for spacing
    expect(calls.filter((c) => c.length === 0).length).toBeGreaterThan(0);
  });
});
