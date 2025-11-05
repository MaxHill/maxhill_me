import { handleAttributeChange } from "./reflect-attribute";

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
