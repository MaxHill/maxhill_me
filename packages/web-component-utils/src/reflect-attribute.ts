// Declare Symbol.metadata for TypeScript (part of TC39 decorator metadata proposal)
declare global {
  interface SymbolConstructor {
    readonly metadata: unique symbol;
  }
}

// Ensure Symbol.metadata exists (TypeScript doesn't polyfill it)
(Symbol as any).metadata ??= Symbol("metadata");

// Global WeakMap to store property metadata, keyed by class metadata object
declare global {
  var __mElementPropertyMetadata: WeakMap<
    object,
    Map<string, { propertyKey: string; attributeName: string }>
  >;
}

globalThis.__mElementPropertyMetadata ??= new WeakMap();

function registerPropertyMetadata(
  context: ClassFieldDecoratorContext,
  propertyKey: string,
  attributeName: string,
) {
  // Store property metadata at class definition time using Symbol.metadata
  // This is the Lit approach - metadata is available immediately without needing instances
  const metadata =
    (context.metadata as any)?.[Symbol.metadata] ?? context.metadata;
  if (metadata) {
    let properties = globalThis.__mElementPropertyMetadata.get(metadata);
    if (!properties) {
      properties = new Map();
      globalThis.__mElementPropertyMetadata.set(metadata, properties);
    }
    properties.set(propertyKey, { propertyKey, attributeName });
  }
}

function reflectValue(
  element: HTMLElement,
  attributeName: string,
  value: any,
  options: { type: string; converter: ((value: any) => string | null) | undefined },
) {
  if (options.converter) {
    const converted = options.converter(value);
    if (converted == null) {
      element.removeAttribute(attributeName);
    } else {
      element.setAttribute(attributeName, converted);
    }
  } else if (options.type === "boolean") {
    element.toggleAttribute(attributeName, Boolean(value));
  } else if (value == null || value === "") {
    element.removeAttribute(attributeName);
  } else {
    element.setAttribute(attributeName, String(value));
  }
}

export function BindAttribute(options?: {
  attribute?: string;
  converter?: (value: any) => string;
}) {
  return function (_target: any, context: ClassFieldDecoratorContext) {
    const propertyKey = String(context.name);
    const attributeName = options?.attribute || propertyKey.toLowerCase();

    registerPropertyMetadata(context, propertyKey, attributeName);

    return function (this: any, initialValue: any) {
      const type = typeof initialValue;
      const privateKey = Symbol.for(`_${propertyKey}`);
      const ctor = this.constructor as any;

      // Update type information in the class-level metadata
      if (ctor.__attributeToProperty?.has(attributeName)) {
        const mapping = ctor.__attributeToProperty.get(attributeName);
        if (mapping) {
          mapping.type = type;
        }
      }

      Object.defineProperty(this, propertyKey, {
        get(this: any) {
          return this[privateKey];
        },
        set(this: any, newValue: any) {
          const oldValue = this[privateKey];
          if (oldValue === newValue) {
            return;
          }

          this[privateKey] = newValue;

          if (this instanceof HTMLElement) {
            reflectValue(this, attributeName, newValue, {
              type,
              converter:
                type === "boolean" || newValue == null || newValue === ""
                  ? undefined
                  : options?.converter,
            });
          }
        },
        enumerable: true,
        configurable: true,
      });

      this[privateKey] = initialValue;
      return initialValue;
    };
  };
}

export function UpdatesAttribute(options?: {
  attribute?: string;
  converter?: (value: any) => string | null;
}) {
  return function (_target: any, context: ClassFieldDecoratorContext) {
    const propertyKey = String(context.name);
    const attributeName = options?.attribute || propertyKey.toLowerCase();

    return function (this: any, initialValue: any) {
      const type = typeof initialValue;
      const privateKey = Symbol.for(`_${propertyKey}`);

      const existingDescriptor = Object.getOwnPropertyDescriptor(
        this,
        propertyKey,
      );
      const existingSetter = existingDescriptor?.set?.bind(this);
      const existingGetter = existingDescriptor?.get?.bind(this);

      Object.defineProperty(this, propertyKey, {
        get(this: any) {
          if (existingGetter) {
            return existingGetter.call(this);
          }
          return this[privateKey];
        },
        set(this: any, newValue: any) {
          const oldValue = existingGetter
            ? existingGetter.call(this)
            : this[privateKey];
          if (oldValue === newValue) {
            return;
          }

          if (existingSetter) {
            existingSetter.call(this, newValue);
          } else {
            this[privateKey] = newValue;
          }

          if (this instanceof HTMLElement) {
            reflectValue(this, attributeName, newValue, {
              type,
              converter: options?.converter,
            });
          }
        },
        enumerable: true,
        configurable: true,
      });

      if (!existingGetter) {
        this[privateKey] = initialValue;
      }

      return initialValue;
    };
  };
}

export function handleAttributeChange(
  element: HTMLElement,
  name: string,
  newValue: string | null,
) {
  const ctor = element.constructor as any;
  const mapping = ctor.__attributeToProperty?.get(name);

  if (mapping) {
    const { propertyKey, type } = mapping;

    let propertyValue: any;
    if (type === "boolean") {
      propertyValue = newValue !== null;
    } else if (type === "number") {
      propertyValue = newValue ? Number(newValue) : undefined;
    } else {
      propertyValue = newValue || "";
    }

    // Set the property, avoiding infinite loops by checking if we're currently reflecting
    const privateKey = Symbol.for(`_${propertyKey}`);
    (element as any)[privateKey] = propertyValue;
  }
}
