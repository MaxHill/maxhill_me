import { handleAttributeChange } from "./reflect-attribute";

export class MElement extends HTMLElement {
  attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
    if (oldValue === newValue) return;
    handleAttributeChange(this, name, newValue as string | null);
  }
  
  static define(tag: string, registry = customElements) {
    if (!registry.get(tag)) {
      registry.define(tag, this);
    }
    return this;
  }
}
