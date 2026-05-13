---
name: qb-frontend-dev
description: Build front end UI web apps with the QuantumBlack Design System (QBDS) — a shadcn-based component registry with 39+ React components, Material Symbols icons, and complete visual foundations.
---

# QB Frontend UI Developer Skill

## Design Library

ALWAYS use the QB Design Library for theme, colour, font and component decisions.

You can see what is available at [https://designsystem.quantumblack.com/](https://designsystem.quantumblack.com/)

The source code is available at [https://github.com/mckinsey/quantumblack-design-system](https://github.com/mckinsey/quantumblack-design-system)

Avoid creating your own components and import components from the QB Design Library. If the components aren't exactly what you need then import and extend them. Finally if this doesn't work then create your own components.

### Prerequisites

The consuming project must have:
1. A React project (Next.js, Vite, etc.) with **Tailwind CSS v4** configured
2. **shadcn/ui initialized** — run `npx shadcn@latest init` if not already set up

### Registry Setup

Add the QB Design System registry to your project's `components.json`:

```json
"registries": {
  "@qbds": {
    "url": "https://designsystem.quantumblack.com/r/{name}.json"
  }
}
```

**Note:** The registry name must be `@qbds` — components reference this prefix internally.

### Installing Components

```bash
npx shadcn@latest add @qbds/component_name

# e.g. for slider component
npx shadcn@latest add @qbds/slider
```

The first component you install will add the QBDS theme to `styles/globals.css`. Ensure this stylesheet is imported in your main `layout.tsx`:

```tsx
import '../styles/globals.css'
```

Example:
If you are making a `Form`, use existing `Input` and `Button` components and extend them rather than creating new versions from scratch.

## Component Documentation Structure

Component examples and API documentation are available in the `resources/docs/` directory. This directory contains two subdirectories:

### `resources/docs/examples/`

Contains working code examples for each component in JSON format. Each file is an array of example objects with:
- `name`: The example function name (e.g., "ButtonDemo", "ButtonVariants")
- `code`: Complete React/JSX code as a string that demonstrates the component usage

**How to use:**
1. Read the appropriate JSON file for the component you need (e.g., `resources/docs/examples/button.json`)
2. Each file contains multiple examples showing different variants, sizes, states, and use cases
3. Use these examples as templates - the code is production-ready and follows QB Design System best practices
4. Copy the `code` field content directly into your implementation

**Example structure:**
```json
[
  {
    "name": "ButtonDemo",
    "code": "export function ButtonDemo() {\n  return <Button>Click me</Button>\n}"
  },
  {
    "name": "ButtonVariants",
    "code": "export function ButtonVariants() {\n  return (\n    <div className=\"flex flex-wrap gap-4\">\n      <Button variant=\"default\">Default</Button>\n      <Button variant=\"accent\">Accent</Button>\n    </div>\n  )\n}"
  }
]
```

### `resources/docs/api/`

Contains component API documentation in JSON format. Each file describes:
- `displayName`: The component name
- `description`: What the component does
- `props`: Object with all available props, including:
  - `type`: TypeScript type definition
  - `defaultValue`: Default value if not specified
  - `description`: What the prop does
  - `required`: Whether the prop is required

**How to use:**
1. Read the appropriate JSON file to understand component props (e.g., `resources/docs/api/button.json`)
2. Reference this when you need to know what props are available and their types
3. Use this to ensure you're passing correct prop values and types

**Example structure:**
```json
[
  {
    "displayName": "Button",
    "description": "Button component that allows users to take actions with a single click or tap.",
    "props": {
      "variant": {
        "type": "\"default\" | \"accent\" | \"secondary\" | \"outline\" | \"ghost\"",
        "defaultValue": null,
        "description": "",
        "required": false
      },
      "size": {
        "type": "\"default\" | \"xs\" | \"sm\" | \"lg\" | \"icon-xs\" | \"icon-sm\" | \"icon\" | \"icon-lg\"",
        "defaultValue": null,
        "description": "",
        "required": false
      }
    }
  }
]
```

### Available Components

The following components have both examples and API documentation:

**Form & Input Components:** button, calendar, checkbox, combobox, date-picker, dialog, dropdown-menu, field, form, input, input-group, label, menubar, radio-group, select, slider, switch, textarea, time-input, time-picker, toggle

**Display & Layout Components:** alert, avatar, badge, card, collapsible, empty, icon-shell, popover, progress, scroll-area, separator, sidebar, skeleton, sonner, table, data-table, tabs, tag, tag-toggle, tooltip

### Workflow for Using Component Documentation

When implementing a component:
1. **First, read the API documentation** (`resources/docs/api/[component].json`) to understand available props and their types
2. **Then, read the examples** (`resources/docs/examples/[component].json`) to see working implementations
3. **Choose the most appropriate example** that matches your use case (e.g., ButtonWithIcons, ButtonVariants, etc.)
4. **Copy and adapt the code** from the example, ensuring you use the correct prop types from the API docs
5. **Ensure all required imports are included** - examples may reference other components like `IconShell`

**Example: Implementing a Button**

**Step 1: Read API documentation to understand available props**
```bash
# Read the API documentation file
Read resources/docs/api/button.json
```
From the API docs, you'll learn:
- Available `variant` options: "default" | "accent" | "secondary" | "outline" | "ghost"
- Available `size` options: "default" | "xs" | "sm" | "lg" | "icon-xs" | "icon-sm" | "icon" | "icon-lg"
- Whether props are required or optional
- Default values for each prop
- The `asChild` prop for composition patterns

Use this information to understand what configurations are possible before writing code.

**Step 2: Read examples to see working implementations**
```bash
# Read the examples file
Read resources/docs/examples/button.json
```
From the examples, you'll see:
- `ButtonDemo`: Basic button usage
- `ButtonVariants`: All visual variants (default, accent, secondary, outline, ghost)
- `ButtonSizes`: Different size options
- `ButtonDisabled`: Disabled state handling
- `ButtonWithIcons`: How to add leading/trailing icons using IconShell
- `ButtonLoading`: Loading states with spinner icons
- `ButtonIconOnly`: Icon-only buttons with different sizes
- `ButtonIconRounded`: Rounded icon buttons

Each example includes complete, working JSX code that you can use directly.

**Step 3: Select the most appropriate example for your use case**

Based on your requirements, choose the example that best matches:
- Need a simple button? Use `ButtonDemo`
- Need multiple button styles? Use `ButtonVariants`
- Need an icon button? Use `ButtonIconOnly` or `ButtonIconRounded`
- Need a button with icons? Use `ButtonWithIcons`
- Need a loading state? Use `ButtonLoading`

**Step 4: Copy and adapt the code from the selected example**

Extract the `code` field from the chosen example. For instance, if using `ButtonWithIcons`:

```jsx
export function ButtonWithIcons() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button>
        <IconShell size="sm">
          <CropFree />
        </IconShell>
        Leading Icon
      </Button>
      <Button>
        Trailing Icon
        <IconShell size="sm">
          <CropFree />
        </IconShell>
      </Button>
    </div>
  )
}
```

Adapt this to your needs:
- Change the icon components (e.g., replace `CropFree` with your desired icon)
- Modify the text content
- Adjust the `variant` or `size` props based on Step 1 API docs
- Update className or layout as needed

**Step 5: Ensure all required imports and dependencies are included**

Based on the code you copied, identify and add necessary imports:

```tsx
import { Button } from "@/components/ui/button"
import { IconShell } from "@/components/ui/icon-shell"
import { CropFree } from "@/components/icons" // Or your icon library
```

**Important considerations:**
- QB Design System components typically come from `@/components/ui/`
- Icons are wrapped in `IconShell` component for consistent sizing
- Icon components might come from a separate icons package
- Check if any additional components are referenced (e.g., `ProgressActivity` for loading states)
- Maintain the QB Design System styling patterns (e.g., using `flex`, `gap-4`, etc.)

**Complete implementation checklist:**
- [ ] Read API docs to understand available props
- [ ] Read examples to see implementations
- [ ] Choose the most relevant example
- [ ] Copy the code from the example
- [ ] Adapt the code to your specific requirements
- [ ] Add all necessary imports
- [ ] Verify prop types match the API documentation
- [ ] Test that the component renders correctly


## Visual Foundations

### Color System

Two neutral scales anchor the palette:

| Scale | Range | Role |
|---|---|---|
| **Mist** | `#ffffff` → `#d3d6d9` | Light surfaces, light-mode text-inverse, outlines |
| **Slate** | `#373a44` → `#10121b` | Dark surfaces, dark-mode text, fills |

Brand accents:
- **QB Cyan** `#00a9f4` — primary brand accent (buttons, badges, focus rings)
- **McKinsey Deep Blue** `#051c2c` — deep brand background
- **McKinsey Electric Blue** `#2251ff` — secondary accent

Status colors use Tailwind's green/red/amber/cyan scales mapped to semantic tokens. Use the design system's semantic color tokens (e.g. `text-fg-primary`, `bg-surface-bg-base`) rather than raw hex values.

### Typography

- **Font**: Inter (weights 300 Light, 400 Regular, 600 Semibold) — the single typeface for all UI text
- **Mono font**: Roboto Mono 400 for code samples
- Type scale: Display (56/48/40px), Headings H1–H4 (32–16px), Labels, Paragraphs (16/14/12px)
- Letter-spacing: negative for large text (−0.96px at D2), near-zero for small text

### Corner Radius

- **Sharp by default** — all radius tokens are `0px` in `:root`
- **Optional `.radius-mode`** class adds: sm=4px, reg=8px, md=12px, lg=16px
- Cards, inputs, badges, and buttons are all square-cornered unless `.radius-mode` is applied
- Badge `format="pill"` uses `border-radius: 9999px` (always round)

### Elevation / Shadow

Five shadow levels (0–4):
- **0**: Subtle definition (1px border-like)
- **1**: Floating cards, tooltips
- **2**: Dropdowns, popovers
- **3**: Dialogs, drawers
- **4**: Large overlays

No glow effects; no colored shadows.

### Backgrounds & Surfaces

- Light mode: Mist surfaces (`--mist-50` to `--mist-500`)
- Dark mode: Slate surfaces (`--slate-800` to `--slate-950`)
- **No gradients, patterns, or textures** as backgrounds
- **No full-bleed imagery** — content is typographic + component-based

## Interaction Patterns

### State Layers

Hover/press states use opacity overlays on top of the background:
- **Hover**: 8% opacity slate (light) / 8% opacity mist (dark)
- **Pressed/Active**: 16% opacity
- **Disabled**: 8% state layer + reduced text opacity (38%)
- No scale transforms on press — color-only state changes

### Hover & Press

- Buttons: text underlines on hover via `group-hover/btn:underline` on text span
- Tabs: animated border expands from center on hover (`scale-x-0 → scale-x-100`)
- Interactive icons: opacity transition `0.2s`
- Focus ring: `sky-400` (`#38bdf8`) — always the focus color regardless of mode

### Animation

- **Minimal** — primarily transition-based, no complex keyframe animations
- Standard duration: **200ms** for UI state changes
- No bounce or spring easing; standard ease

## Tone & Voice

When writing UI copy (labels, descriptions, status messages):
- **Functional and direct** — terse, developer-facing, no marketing fluff
- **Third person** for component descriptions ("Displays contextual messages…", "Allows users to take actions…")
- **Sentence case** for descriptions and labels; **Title Case** for component names and headings
- **No emoji** anywhere in the UI or documentation
- Error/status messages are plain and factual

## Design Constraints

When building with the QB Design System, do NOT:
- Use gradients, patterns, or textures as backgrounds
- Use emoji, Unicode glyphs, or PNG icons — only Material Symbols Sharp SVGs
- Use illustrations or brand imagery — content is typographic + component-based
- Use backdrop blur effects
- Use custom/brand typefaces — Inter is the only typeface
- Add bounce or spring animations — use 200ms ease transitions only
- Use colored or glowing shadows

## Icons

The design system uses **Material Symbols Sharp** SVG icons from `@material-symbols/svg-400`, wrapped as React components. Icons live in `src/components/icons/` in the design system repo and are exported from `src/components/icons/index.ts`.

- Icons use `fill="currentColor"` — they inherit text color from the parent
- Size is controlled via className: `size-4` (16px), `size-5` (20px)
- Icon opacity class: `icon` = 60% opacity; `icon-interactive` = 60%→88% on hover

Always wrap icons in the `IconShell` component for consistent sizing:

```tsx
import { IconShell } from "@/components/ui/icon-shell"
import { CropFree } from "@/components/icons"

<IconShell size="sm">
  <CropFree />
</IconShell>
```

Common icons available: Close, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CalendarMonth, ArrowForward, CheckCircle, Cancel, ErrorIcon, Info, PlaylistAddCheck, SwapVert, ArrowDownwardAlt, ArrowUpwardAlt.

## Technology Stack

The design system is built on:
- **React 19** with **TypeScript 5**
- **Tailwind CSS v4** for styling
- **Radix UI** primitives for accessible, unstyled component foundations
- **shadcn/ui** (new-york style) for registry tooling and component patterns
- **TanStack Table** for data table components
- **react-hook-form** + **zod** for form validation

## Composition of components

The QB Design Library is designed around reuse and composibility. You should use it to build up more complex components by using the smaller atomic elements that it provides. For example, to add a slider component with an icon, you could construct it like this:

```
<div className="flex">
   <Icon />
   <Slider />
   <label>hello world</label>
</div>
```

This ensures you can move the `Icon` to the start or end of the slider very easily, rather than if it was nested in a larger, more complex component like `SliderWithIcon`.
