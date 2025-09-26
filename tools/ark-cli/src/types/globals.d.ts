// Global types for Node.js APIs that may not be in older type definitions

declare global {
  var AbortController: typeof globalThis.AbortController;
  var AbortSignal: typeof globalThis.AbortSignal;
}

export {};
