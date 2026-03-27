import { handleAttributeChange } from "./reflect-attribute";

// Fallback for crypto.randomUUID in older browsers
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random string
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export class MElement extends HTMLElement {
  static tagName: string;
  
  private static __finalized = false;
  private static __syncedAttributes?: string[];
  private static __attributeToProperty?: Map<string, { propertyKey: string; type: string }>;

  static get observedAttributes(): string[] {
    // Finalize the class to ensure metadata is processed
    this.finalize();
    return this.__syncedAttributes || [];
  }
  
  /**
   * Finishes setting up the class by processing decorator metadata.
   * This is called automatically by observedAttributes getter before
   * the element is registered.
   */
  protected static finalize() {
    if (this.__finalized) {
      return;
    }
    this.__finalized = true;
    
    const attributes = new Set<string>();
    const attributeToProperty = new Map<string, { propertyKey: string; type: string }>();
    
    // Walk up the prototype chain to collect metadata from all classes
    let ctor: any = this;
    while (ctor && ctor !== HTMLElement) {
      // Read metadata from the global WeakMap using Symbol.metadata
      const metadata = (ctor as any)[Symbol.metadata];
      if (metadata) {
        const properties = globalThis.__mElementPropertyMetadata?.get(metadata);
        if (properties) {
          for (const [propertyKey, { attributeName }] of properties) {
            attributes.add(attributeName);
            // Store with default type 'string', will be updated when instances are created
            if (!attributeToProperty.has(attributeName)) {
              attributeToProperty.set(attributeName, { 
                propertyKey, 
                type: 'string' 
              });
            }
          }
        }
      }
      ctor = Object.getPrototypeOf(ctor);
    }
    
    this.__syncedAttributes = Array.from(attributes);
    this.__attributeToProperty = attributeToProperty;
  }

  attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
    if (oldValue === newValue) return;
    handleAttributeChange(this, name, newValue as string | null);
  }
  
  static define(tag?: string, registry = customElements) {
    const tagToUse = tag ?? this.tagName;
    if (!tagToUse) {
      throw new Error(`No tag name provided and ${this.name} does not define static tagName`);
    }
    if (!registry.get(tagToUse)) {
      registry.define(tagToUse, this);
    }
    return this;
  }
}
