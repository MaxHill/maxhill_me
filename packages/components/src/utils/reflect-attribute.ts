// Declare Symbol.metadata for TypeScript (part of TC39 decorator metadata proposal)
declare global {
  interface SymbolConstructor {
    readonly metadata: unique symbol;
  }
}

// Ensure Symbol.metadata exists (TypeScript doesn't polyfill it)
(Symbol as any).metadata ??= Symbol('metadata');

// Global WeakMap to store property metadata, keyed by class metadata object
declare global {
  var __mElementPropertyMetadata: WeakMap<object, Map<string, { propertyKey: string; attributeName: string }>>;
}

globalThis.__mElementPropertyMetadata ??= new WeakMap();

export function BindAttribute(options?: { 
  attribute?: string;
  converter?: (value: any) => string;
}) {
  return function(_target: any, context: ClassFieldDecoratorContext) {
    const propertyKey = context.name as string;
    const attributeName = options?.attribute || propertyKey.toLowerCase();
    
    // Store property metadata at class definition time using Symbol.metadata
    // This is the Lit approach - metadata is available immediately without needing instances
    const metadata = (context.metadata as any)?.[Symbol.metadata] ?? context.metadata;
    if (metadata) {
      let properties = globalThis.__mElementPropertyMetadata.get(metadata);
      if (!properties) {
        properties = new Map();
        globalThis.__mElementPropertyMetadata.set(metadata, properties);
      }
      properties.set(propertyKey, { propertyKey, attributeName });
    }
    
    // Use addInitializer to update type information when instances are created
    context.addInitializer(function(this: any) {
      // This runs during instance construction, allowing us to infer types
      // from initial values
    });
    
    return function(this: any, initialValue: any) {
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
          if (oldValue === newValue) return;
          
          this[privateKey] = newValue;
          
          if (this instanceof HTMLElement) {
            if (type === 'boolean') {
              if (newValue) {
                this.setAttribute(attributeName, '');
              } else {
                this.removeAttribute(attributeName);
              }
            } else {
              if (newValue == null || newValue === '') {
                this.removeAttribute(attributeName);
              } else {
                const strValue = options?.converter ? options.converter(newValue) : String(newValue);
                this.setAttribute(attributeName, strValue);
              }
            }
          }
        },
        enumerable: true,
        configurable: true
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
  return function(_target: any, context: ClassFieldDecoratorContext) {
    const propertyKey = context.name as string;
    const attributeName = options?.attribute || propertyKey.toLowerCase();
    
    return function(this: any, initialValue: any) {
      const type = typeof initialValue;
      const privateKey = Symbol.for(`_${propertyKey}`);
      
      const existingDescriptor = Object.getOwnPropertyDescriptor(this, propertyKey);
      const existingSetter = existingDescriptor?.set;
      const existingGetter = existingDescriptor?.get;
      
      Object.defineProperty(this, propertyKey, {
        get(this: any) {
          if (existingGetter) {
            return existingGetter.call(this);
          }
          return this[privateKey];
        },
        set(this: any, newValue: any) {
          const oldValue = existingGetter ? existingGetter.call(this) : this[privateKey];
          if (oldValue === newValue) return;
          
          if (existingSetter) {
            existingSetter.call(this, newValue);
          } else {
            this[privateKey] = newValue;
          }
          
          if (this instanceof HTMLElement) {
            if (options?.converter) {
              const converted = options.converter(newValue);
              if (converted == null) {
                this.removeAttribute(attributeName);
              } else {
                this.setAttribute(attributeName, converted);
              }
            } else if (type === 'boolean') {
              if (newValue) {
                this.setAttribute(attributeName, '');
              } else {
                this.removeAttribute(attributeName);
              }
            } else {
              if (newValue == null || newValue === '') {
                this.removeAttribute(attributeName);
              } else {
                this.setAttribute(attributeName, String(newValue));
              }
            }
          }
        },
        enumerable: true,
        configurable: true
      });
      
      if (!existingGetter) {
        this[privateKey] = initialValue;
      }
      
      return initialValue;
    };
  };
}

export function handleAttributeChange(element: HTMLElement, name: string, newValue: string | null) {
  const ctor = element.constructor as any;
  const mapping = ctor.__attributeToProperty?.get(name);
  
  if (mapping) {
    const { propertyKey, type } = mapping;
    
    let propertyValue: any;
    if (type === 'boolean') {
      propertyValue = newValue !== null;
    } else if (type === 'number') {
      propertyValue = newValue ? Number(newValue) : undefined;
    } else {
      propertyValue = newValue || '';
    }
    
    // Set the property, avoiding infinite loops by checking if we're currently reflecting
    const privateKey = Symbol.for(`_${propertyKey}`);
    (element as any)[privateKey] = propertyValue;
  }
}
