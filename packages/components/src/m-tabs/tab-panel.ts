import { BindAttribute, handleAttributeChange } from "../utils/reflect-attribute";
import styles from "./tab-panel.css?inline";
const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export class MTabPanel extends HTMLElement {

    static observedAttributes = ["visible", "name"]
    #shadowRoot: ShadowRoot;

    @BindAttribute()
    name: string = "";

    @BindAttribute()
    visible: boolean = false;

    constructor() {
        super();
        this.#shadowRoot = this.attachShadow({ mode: 'open' });
        this.#shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        if (!this.id) {
            this.id = `panel-${crypto.randomUUID()}`;
        }
        this.setAttribute('role', 'tabpanel');
        this.setAttribute("slot", "tab-panel");
        this.render();
    }
    disconnectedCallback() {
        this.visible = false;
    }

    attributeChangedCallback (name: string, oldValue: unknown, newValue: unknown) {
        handleAttributeChange(this, name, newValue as string | null);
    }

    render() {
        this.#shadowRoot.innerHTML = `
            <slot></slot>
        `;
    }

    static define(tag = 'm-tab-panel', registry = customElements) {
        if (!registry.get(tag)) {
            registry.define(tag, this);
        }
        return this;
    }
}

