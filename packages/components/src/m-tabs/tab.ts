import { BindAttribute } from "../utils/reflect-attribute";
import { MElement } from "../utils/m-element";

export class MTab extends MElement {
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

    attributeChangedCallback (name: string, oldValue: unknown, newValue: unknown) {
        super.attributeChangedCallback(name, oldValue, newValue);
        
        if (name === 'panel') {
            this.panel = newValue as string;
        }
        if (name === 'active') {
          this.setAttribute('aria-selected', this.active ? 'true' : 'false');
          this.setAttribute('tabindex', this.active ? '0' : '-1');
        }

        if (name === 'disabled') {
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
        return super.define(tag, registry) as typeof MTab;
    }
}

