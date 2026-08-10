# Code generators

This directory contains Plop templates for components, events, and OCaml projects.

## Usage

```bash
mise run generate
```

## Features

### OCaml project generator

Creates an OCaml project at a path relative to `<repo_root>`. For example, `apps/my_app` creates `<repo_root>/apps/my_app`.

The project includes:

- a local-switch `mise` task interface
- inline `ppx_expect` tests in `lib/`
- Hegel property tests in `test/`
- generated dune and opam package files

After generation, follow `docs/runbooks/create-ocaml-project.md` to create the switch and install dependencies.

### Component Generator

Creates a new MElement-based web component with the following options:

1. **Component Name** - Automatically prefixes with `m-` if not provided
2. **Description** - Component description for JSDoc
3. **Target Location** - Choose between:
   - Component Library (`@maxhill/components`)
   - golf App (with sub-options for root or feature folders)
4. **Use uhtml** - Choose whether to use uhtml for rendering
   - Library components: imports from `@maxhill/uhtml`
   - App components: imports from relative vendor path
5. **Include global stylesheet** (app only) - Include global styles in the component
   - Only shown for app components
   - Imports from `styles/global-styles`
   - Adds `globalStyleSheet` to `adoptedStyleSheets`
6. **Include DOCS.mdx** - Generate documentation file (defaults to true for library)
7. **Update register-all.ts** - Auto-update the registration file (library only)

### Auto-Define Pattern

Library components automatically include the auto-define pattern:

```typescript
// Auto-define when using default import
ComponentName.define();

export default ComponentName;
```

This allows users to import components with automatic registration:

```typescript
// Automatically registers the component
import MButton from "@maxhill/components/m-button";

// OR use named import for manual control
import { MButton } from "@maxhill/components/m-button";
MButton.define(); // Manual registration
```

### Rendering Options

**Without uhtml (innerHTML):**
```typescript
private render() {
    this.shadowRoot!.innerHTML = `
        <p>component-name</p>
        <slot></slot>
    `;
}
```

**With uhtml:**
```typescript
private render() {
    render(this.shadowRoot!, html`
        <p>component-name</p>
        <slot></slot>
    `);
}
```

### Global Stylesheet (App Components)

App components can optionally include the global stylesheet for consistent theming:

```typescript
import { globalStyleSheet } from "../styles/global-styles";

constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.adoptedStyleSheets = [globalStyleSheet, baseStyleSheet];
}
```

This provides access to global CSS custom properties and base styles while maintaining component encapsulation.

### Event Generator

Creates custom event classes with:
- Configurable path (library or app)
- Cancelable option
- Type-safe event details

## Template Structure

```
plop/
├── README.md
└── templates/
    ├── component/
    │   ├── index.ts.hbs
    │   ├── index.css.hbs
    │   ├── index.test.ts.hbs
    │   └── DOCS.mdx.hbs
    ├── event/
    │   └── event.ts.hbs
    └── ocaml-project/
        ├── bin-dune.hbs
        ├── dune-project.hbs
        ├── gitignore.hbs
        ├── lib-dune.hbs
        ├── lib.ml.hbs
        ├── main.ml.hbs
        ├── mise.toml.hbs
        ├── project.opam.hbs
        ├── test-dune.hbs
        └── test.ml.hbs
```
