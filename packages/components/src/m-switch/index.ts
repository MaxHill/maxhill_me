import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import { query, queryAll } from "../utils/query";
import styles from "./index.css?inline";
import { MSwitchChangeEvent } from "./events";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Switch input for boolean values
 * 
 * @customElement
 * @tagname m-switch
 * 
 * @slot - Default slot for component content
 * 
 * @attr {string} example - An example property
 * 
 * @prop {string} example - An example property
 * 
 * @fires m-switch-change - Fired when the example changes (detail: { example: string })
 */
export class MSwitch extends MElement {
    static tagName = 'm-switch';
    static observedAttributes = ['example'];

    private _shadowRoot: ShadowRoot;

    @BindAttribute()
    example: string = '';

    @query('slot')
    private defaultSlot!: HTMLSlotElement;

    constructor() {
        super();
        this._shadowRoot = this.attachShadow({ mode: 'open' });
        this._shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        this.render();
        this.dispatchEvent(new MSwitchChangeEvent({ example: this.example }));
    }

    private render() {
        this._shadowRoot.innerHTML = `
            <p>m-switch</p>
            <slot></slot>
        `;
    }
}

export default MSwitch;
