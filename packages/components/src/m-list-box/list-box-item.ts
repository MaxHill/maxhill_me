import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import styles from "./list-box-item.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

export class MListBoxItem extends MElement {
    static tagName = 'm-list-box-item';
    static observedAttributes = ['value', 'selected', 'focused', 'disabled'];

    @BindAttribute()
    value: string = '';

    @BindAttribute()
    selected: boolean = false;

    @BindAttribute()
    focused: boolean = false;

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
            console.log("selected changed", oldValue, newValue)
            this.setAttribute('aria-selected', String(this.selected));
        }

        if (name === 'disabled') {
            console.log("disabled changed", oldValue, newValue)
            this.#updateDisabledState();
        }

        if (name === 'focused') {
            console.log("focused changed", oldValue, newValue)
            // Use the reflected property boolean instead of raw attribute string
            this.setVirtualFocus(this.focused);
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
