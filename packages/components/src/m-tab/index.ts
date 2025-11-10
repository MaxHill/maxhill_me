import { BindAttribute } from "../utils/reflect-attribute";
import { MElement } from "../utils/m-element";
import styles from "./index.css?inline";
const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * A tab button used within m-tab-list for switching between tab panels.
 * 
 * @customElement
 * @tagname m-tab
 * 
 * @slot - Default slot for tab label content
 * 
 * @attr {string} panel - ID of the associated tab panel to control
 * @attr {boolean} active - Whether this tab is currently active
 * @attr {boolean} disabled - Whether this tab is disabled and cannot be selected
 * 
 * @prop {string} panel - ID of the associated tab panel to control
 * @prop {boolean} active - Whether this tab is currently active
 * @prop {boolean} disabled - Whether this tab is disabled and cannot be selected
 */
export class MTab extends MElement {
    static tagName = 'm-tab';
    static observedAttributes = ["active", "panel", "disabled"]

    @BindAttribute()
    panel?: string;

    @BindAttribute()
    active: boolean = false;

    @BindAttribute()
    disabled: boolean = false;

    #shadowRoot: ShadowRoot;

    constructor() {
        super();
        this.#shadowRoot = this.attachShadow({ mode: 'open' });
        this.#shadowRoot.adoptedStyleSheets = [baseStyleSheet];
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
}

export default MTab;
