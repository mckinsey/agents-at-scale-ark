## Guidelines

### General
- Never look outside this current directory or its children
- After a change, always run `npm run build` to make sure the code is valid TS
- Before making a suggestion, always ask "will this really work" 
- Explain why making a change is going to work before suggesting it

### File names
- Always use kebab-case for file names

### Types
- Where possible, define types formally.  Do not do type definitions in function headers
- Where possible avoid using "any"
- Where possible refrain from using "as" to convert an unknown or any into a type
- Generated types are in lib/api/generated/types.ts

### Services
- Services should always be objects that export async functions.
- Services are defined in lib/services
- Services should always use the generated types in lib/api/generated

### Tests
- Use `globalThis` instead of `global` when assigning to global objects. `global` is Node-only and triggers Sonar; `globalThis` is the ES standard
- For mock class methods, use `vi.fn()` class-field assignments rather than empty method bodies — reads as "this is a mock" and avoids Sonar's no-empty-function warning

```typescript
// ❌ WRONG - global is Node-specific; empty methods trigger Sonar
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver;

// ✅ CORRECT
globalThis.ResizeObserver = class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
} as typeof ResizeObserver;
```

### Navigation
- **IMPORTANT**: Do NOT use `useRouter` from `next/navigation` for programmatic navigation
- Instead, use `useNamespacedNavigation` from `@/lib/hooks/use-namespaced-navigation`
- This hook automatically preserves query parameters (especially `namespace`) when navigating between pages
- The dashboard uses namespace-scoped URLs (e.g., `/agents?namespace=kyc-demo`) and navigation must preserve these params

```typescript
// ❌ WRONG - loses query params like namespace
import { useRouter } from 'next/navigation';
const router = useRouter();
router.push('/sessions/123');

// ✅ CORRECT - preserves all query params
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
const { push } = useNamespacedNavigation();
push('/sessions/123');
```
