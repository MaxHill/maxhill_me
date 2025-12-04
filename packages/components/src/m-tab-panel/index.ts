import { BindAttribute } from "../utils/reflect-attribute";
import { MElement, generateUUID } from "../utils/m-element";
import styles from "./index.css?inline";
const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * A tab panel that displays content when its associated tab is active.
 * 
 * @customElement
 * @tagname m-tab-panel
 * 
 * @slot - Default slot for panel content
 * 
 * @attr {string} name - Unique identifier for this panel, referenced by m-tab's panel attribute
 * @attr {boolean} visible - Whether this panel is currently visible
 * @attr {boolean} data-padded - Whether the panel has padding (default: true)
 * 
 * @prop {string} name - Unique identifier for this panel, referenced by m-tab's panel attribute
 * @prop {boolean} visible - Whether this panel is currently visible
 */
export class MTabPanel extends MElement {
    static tagName = 'm-tab-panel';
    static observedAttributes = ["visible", "name"]

    @BindAttribute()
    name: string = "";

    @BindAttribute()
    visible: boolean = false;

    #shadowRoot: ShadowRoot;

    constructor() {
        super();
        this.#shadowRoot = this.attachShadow({ mode: 'open' });
        this.#shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        if (!this.id) {
            this.id = `panel-${generateUUID()}`;
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
}

export default MTabPanel;
