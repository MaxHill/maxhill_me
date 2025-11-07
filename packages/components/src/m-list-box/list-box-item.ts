import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import styles from "./list-box-item.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export class MListBoxItem extends MElement {
    static tagName = 'm-list-box-item';
    static observedAttributes = ['value', 'selected', 'disabled'];

    @BindAttribute()
    value: string = '';

    @BindAttribute()
    selected: boolean = false;

    @BindAttribute()
    disabled: boolean = false;

    #shadowRoot: ShadowRoot;
    _internals: ElementInternals;

    constructor() {
        super();
        this.#shadowRoot = this.attachShadow({ mode: 'open' });
        this.#shadowRoot.adoptedStyleSheets = [baseStyleSheet];
        this._internals = this.attachInternals();
    }

    connectedCallback() {
        this.render();
        this.#setupAccessibility();
    }

    attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
        super.attributeChangedCallback(name, oldValue, newValue);
        
        if (name === 'selected') {
            this.setAttribute('aria-selected', String(this.selected));
        } else if (name === 'disabled') {
            this.#updateDisabledState();
        }
    }

    #setupAccessibility() {
        this.setAttribute('role', 'option');
        this.setAttribute('aria-selected', String(this.selected));
        this.#updateDisabledState();
    }

    #updateDisabledState() {
        if (this.disabled) {
            this.setAttribute('aria-disabled', 'true');
        } else {
            this.removeAttribute('aria-disabled');
        }
    }

    setVirtualFocus(focused: boolean) {
        if (focused) {
            this._internals.states.add('focus');
        } else {
            this._internals.states.delete('focus');
        }
    }

    render() {
        this.#shadowRoot.innerHTML = `
            <slot></slot>
        `;
    }
}
