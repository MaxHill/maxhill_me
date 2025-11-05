import { BindAttribute, handleAttributeChange } from "../utils/reflect-attribute";

export class MTab extends HTMLElement {
    static observedAttributes = ["active", "panel", "disabled"]
    #shadowRoot: ShadowRoot;
    panel?: string;

    @BindAttribute()
    active: boolean = false;

    @BindAttribute()
    disabled: boolean = false;

    constructor() {
        super();
        this.#shadowRoot = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        if (!this.id) {
            this.id = `tab-${crypto.randomUUID()}`;
        }
        this.setAttribute('role', 'tab');
        this.setAttribute('slot', 'tab');
        this.render(); 
    }

    disconnectedCallback() {
        this.active = false;
    }

    attributeChangedCallback (name: string, _oldValue: unknown, newValue: unknown) {
        if (name === 'panel') {
            this.panel = newValue as string;
        }
        if (name === 'active') {
          handleAttributeChange(this, name, newValue as string | null);
          this.setAttribute('aria-selected', this.active ? 'true' : 'false');
          this.setAttribute('tabindex', this.active ? '0' : '-1');
        }

        if (name === 'disabled') {
          handleAttributeChange(this, name, newValue as string | null);
          this.setAttribute('aria-disabled', this.disabled ? 'true' : 'false');
          if (this.active && this.disabled) {
            this.active = false;
          }
        }
    }

    render() {
        this.#shadowRoot.innerHTML = `
          <slot></slot>
        `;
    }

    static define(tag = 'm-tab', registry = customElements) {
        if (!registry.get(tag)) {
            registry.define(tag, this);
        }
        return this;
    }
}

