import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * A selectable item within an m-listbox component.
 * Represents a single option that can be selected, focused, and disabled.
 *
 * @customElement
 * @tagname m-listbox-item
 * 
 * @slot - The default slot contains the visible content of the list item
 */
export class MListboxItem extends MElement {
    static tagName = 'm-listbox-item';
    static observedAttributes = ['value', 'selected', 'focused', 'disabled'];

    /**
     * The value associated with this item.
     * This value is submitted with the form when the item is selected.
     * 
     * @attr value
     */
    @BindAttribute()
    value: string = '';

    /**
     * Whether this item is currently selected.
     * 
     * @attr selected
     */
    @BindAttribute()
    selected: boolean = false;

    /**
     * Whether this item has virtual keyboard focus.
     * Managed by the parent m-list-box component.
     * 
     * @attr focused
     */
    @BindAttribute()
    focused: boolean = false;

    /**
     * Whether this item is disabled and cannot be selected.
     * 
     * @attr disabled
     */
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
         if (!this.id) {
            this.id = `listbox-item-${crypto.randomUUID()}`;
        }
        this.render();
        this.setAttribute('role', 'option');
        this.setAttribute('aria-selected', String(this.selected));
        this.updateDisabledState();
    }

    attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (name === 'selected') {
            this.setAttribute('aria-selected', String(this.selected));
        }

        if (name === 'disabled') {
            this.updateDisabledState();
        }

        if (name === 'focused') {
            if (this.focused) {
                this._internals.states.add('focus');
            } else {
                this._internals.states.delete('focus');
            }
        }

    }

    private updateDisabledState() {
        if (this.disabled) {
            this.setAttribute('aria-disabled', 'true');
        } else {
            this.removeAttribute('aria-disabled');
        }
    }

    render() {
        this.#shadowRoot.innerHTML = `
            <slot></slot>
        `;
    }
}

export default MListboxItem;
