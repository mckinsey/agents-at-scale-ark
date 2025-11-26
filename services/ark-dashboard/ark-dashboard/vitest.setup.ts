import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  root: Element | null = null;
  rootMargin: string = '';
  thresholds: ReadonlyArray<number> = [];

  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// Mock localStorage
const localStorageMock: Storage = {
  getItem: vi.fn((key: string) => {
    return (localStorageMock as unknown as Record<string, string>)[key] || null;
  }),
  setItem: vi.fn((key: string, value: string) => {
    (localStorageMock as unknown as Record<string, string>)[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete (localStorageMock as unknown as Record<string, string>)[key];
  }),
  clear: vi.fn(() => {
    Object.keys(localStorageMock).forEach(key => {
      if (
        key !== 'getItem' &&
        key !== 'setItem' &&
        key !== 'removeItem' &&
        key !== 'clear' &&
        key !== 'length' &&
        key !== 'key'
      ) {
        delete (localStorageMock as unknown as Record<string, string>)[key];
      }
    });
  }),
  get length() {
    return Object.keys(localStorageMock).filter(
      key =>
        key !== 'getItem' &&
        key !== 'setItem' &&
        key !== 'removeItem' &&
        key !== 'clear' &&
        key !== 'length' &&
        key !== 'key',
    ).length;
  },
  key: vi.fn((index: number) => {
    const keys = Object.keys(localStorageMock).filter(
      key =>
        key !== 'getItem' &&
        key !== 'setItem' &&
        key !== 'removeItem' &&
        key !== 'clear' &&
        key !== 'length' &&
        key !== 'key',
    );
    return keys[index] || null;
  }),
};

global.localStorage = localStorageMock;
