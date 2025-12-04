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
