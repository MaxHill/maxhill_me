# @maxhill/web-component-utils

Core utilities for building web components. These are the foundational building blocks used by `@maxhill/components` and available for creating custom web components in your apps.

## What's Included

### MElement
Base class for web components with helpful utilities:
- `define()` static method for registering components
- `generateUUID()` for creating unique IDs
- Attribute change handling

```typescript
import { MElement } from '@maxhill/web-component-utils';

class MyElement extends MElement {
  static tagName = 'my-element';
}

MyElement.define(); // Registers <my-element>
```

### Decorators

#### @BindAttribute
Syncs properties with HTML attributes bidirectionally:

```typescript
class MyElement extends MElement {
  @BindAttribute()
  label: string = '';
  
  @BindAttribute()
  disabled: boolean = false;
}
```

#### @query / @queryAll
Decorator for querying shadow DOM:

```typescript
class MyElement extends MElement {
  @query('button')
  button?: HTMLButtonElement;
  
  @queryAll('.item')
  items!: HTMLElement[];
}
```

### OutsideClickController
Detects clicks outside an element (useful for dropdowns, modals):

```typescript
const controller = new OutsideClickController(
  this, 
  () => this.close(),
  { threshold: 8, scrollCooldown: 100 }
);
controller.connect();
```

## When to Use

Use these utilities when:
- Building custom web components in your apps
- You need the same foundation as `@maxhill/components`
- Creating reusable element patterns

For form inputs, use the components from `@maxhill/components` instead (they include form validation, accessibility, etc.).
