# Component Import Patterns

The `@maxhill/components` library supports two import patterns with different behaviors:

## Pattern 1: Default Import (Auto-Define) ✅

**Use when you want automatic registration:**

```typescript
import MInput from "@maxhill/components/m-input";

// Component is automatically registered as <m-input>
// No need to call customElements.define()
```

This is the **recommended** pattern for most use cases. The component is automatically registered when the module loads.

## Pattern 2: Named Import (Manual Control) 🔧

**Use when you need control over registration:**

```typescript
import { MInput } from "@maxhill/components/m-input";

// Component is NOT automatically registered
// You must manually register it:
customElements.define('m-input', MInput);

// Or with a custom tag name:
customElements.define('my-custom-input', MInput);
```

This pattern is useful when you need to:
- Register the component with a different tag name
- Defer registration until later
- Extend the component before registering it

## Examples

### Simple Usage (Auto-Define)

```typescript
// main.ts
import "@maxhill/components/m-input";
import "@maxhill/components/m-textarea";
import "@maxhill/components/m-combobox";

// All components are now registered and ready to use
```

```html
<!-- index.html -->
<m-input label="Name" required></m-input>
<m-textarea label="Bio"></m-textarea>
<m-combobox label="Country"></m-combobox>
```

### Custom Tag Names

```typescript
import { MInput } from "@maxhill/components/m-input";

// Register with a custom name
customElements.define('custom-input', MInput);
```

```html
<custom-input label="Name"></custom-input>
```

### Extending Components

```typescript
import { MInput } from "@maxhill/components/m-input";

class MyInput extends MInput {
  connectedCallback() {
    super.connectedCallback();
    // Custom logic
  }
}

customElements.define('my-input', MyInput);
```

### Conditional Loading

```typescript
import { MInput } from "@maxhill/components/m-input";

// Only register if needed
if (shouldUseComponent()) {
  customElements.define('m-input', MInput);
}
```

## Implementation Details

When you use a default import, the module executes this code:

```typescript
// Auto-define when using default import
if (!customElements.get(MInput.tagName)) {
  customElements.define(MInput.tagName, MInput);
}

export default MInput;
```

This ensures:
- ✅ No duplicate registration errors
- ✅ Safe to import multiple times
- ✅ Works in any module system

## Migration Guide

If you were previously using `registerAll()`:

### Before
```typescript
import { registerAll } from "@maxhill/components/register-all";
registerAll(); // Imports ALL components (28.5 kB)
```

### After
```typescript
// Option 1: Auto-define (recommended)
import "@maxhill/components/m-input";
import "@maxhill/components/m-textarea";
// Only imports what you need (~5-10 kB)

// Option 2: Manual control
import { MInput } from "@maxhill/components/m-input";
import { MTextarea } from "@maxhill/components/m-textarea";
customElements.define('m-input', MInput);
customElements.define('m-textarea', MTextarea);
```

### Bundle Size Impact

| Method | Bundle Size (gzipped) |
|--------|-----------------------|
| `registerAll()` | ~28.5 kB (all 17 components) |
| Default imports | ~2-5 kB per component |
| Named imports | ~2-5 kB per component (same) |

**Importing only the components you use can save 15-20 kB!**

## FAQ

### Q: Which import style should I use?

**A:** Use default imports (auto-define) for most cases. Only use named imports when you need manual control.

### Q: Can I mix both patterns?

**A:** Yes! You can use both patterns in the same project.

```typescript
import MInput from "@maxhill/components/m-input"; // Auto-defined
import { MTextarea } from "@maxhill/components/m-textarea"; // Manual

customElements.define('my-textarea', MTextarea);
```

### Q: Will importing the same component twice cause errors?

**A:** No. The auto-define logic checks if the component is already registered.

```typescript
import MInput from "@maxhill/components/m-input"; // Registers
import MInput from "@maxhill/components/m-input"; // Safe, already registered
```

### Q: Do I need to import components in HTML?

**A:** No, components must be imported in JavaScript/TypeScript modules. However, you can use import maps:

```html
<script type="importmap">
{
  "imports": {
    "m-input": "./node_modules/@maxhill/components/dist/m-input.js"
  }
}
</script>
<script type="module">
  import "m-input"; // Auto-defines
</script>
```

## Testing

To verify the behavior, open `test-auto-define.html` in a browser. All tests should pass:

- ✅ Default import auto-defines
- ✅ Named import does not auto-define
- ✅ Manual define works
- ✅ Components render correctly
- ✅ Re-import is safe

## Components Supporting This Pattern

All components in `@maxhill/components` support both import patterns:

- m-card
- m-combobox
- m-command
- m-command-palette
- m-copy-button
- m-fit-text
- m-input
- m-listbox
- m-option
- m-popover-menu
- m-search-list
- m-tab
- m-tab-list
- m-tab-panel
- m-textarea
