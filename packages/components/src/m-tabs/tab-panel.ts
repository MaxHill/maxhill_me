import { BindAttribute } from "../utils/reflect-attribute";
import { MElement } from "../utils/m-element";
import styles from "./tab-panel.css?inline";
const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export class MTabPanel extends MElement {

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

    render() {
        this.#shadowRoot.innerHTML = `
            <slot></slot>
        `;
    }

    static define(tag = 'm-tab-panel', registry = customElements) {
        return super.define(tag, registry) as typeof MTabPanel;
    }
}

