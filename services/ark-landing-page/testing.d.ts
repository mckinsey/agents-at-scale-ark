// Pulls the @testing-library/jest-dom matcher augmentation into the type-check
// program. jest.setup.js imports it at runtime, but tsconfig `include` only
// matches *.ts/*.tsx, so the .js setup is invisible to tsc and the custom
// matchers (toBeInTheDocument, etc.) would otherwise be untyped in test files.
import '@testing-library/jest-dom';
