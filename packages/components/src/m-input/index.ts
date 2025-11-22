import { MFormAssociatedElement } from "../utils/m-form-associated-element";
import { query } from "../utils/query";
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

// Text input specific
// TODO: Selection range
// TODO: setRangeText
// TODO: bind value to input.value to make defaultValue work


/**
 * Text input custom element
 * 
 * @customElement
 * @tagname m-input
 * 
 * @slot - Default slot for component content
 * 
 * @attr {string} example - An example property
 * 
 * @prop {string} example - An example property
 * 
 * @fires m-input-change - Fired when the example changes (detail: { example: string })
 */
export class MInput extends MFormAssociatedElement {
    static tagName = 'm-input';

    static get observedAttributes() {
        return [...super.observedAttributes]
    }

    private _shadowRoot: ShadowRoot;

@query('input')
    private inputElement!: HTMLInputElement;

    @query('label')
    private labelElement!: HTMLInputElement;

    select() { this.inputElement?.select(); }
    focus(options?: FocusOptions) { this.inputElement?.focus(options); }
    blur() { this.inputElement?.blur(); }

    constructor() {
        super();
        this._shadowRoot = this.attachShadow({
            mode: 'open',
            delegatesFocus: true
        });
        this._shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        this.render();
        this.firstUpdate();

        this.inputElement.addEventListener("input", this.handleInput);
        this.inputElement.addEventListener("blur", this.handleBlur);
    }

    disconnectedCallback() {
        this.inputElement.removeEventListener("input", this.handleInput);
        this.inputElement.removeEventListener("blur", this.handleBlur);
    }

    attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
        super.attributeChangedCallback(name, oldValue, newValue);
        this.updateValidity();
        if (name === "label") {
            this.internals.ariaLabel = newValue as string;
        }

        if (name === "disabled") {
            if (this.disabled) {
                this.inputElement.setAttribute("disabled", "");
            } else {
                this.inputElement.removeAttribute("disabled");
            }
        }

        if (name === "label") {
            this.labelElement.textContent = this.label || "";
        }
    }


    //  ------------------------------------------------------------------------
    //  Event handlers                                                                     
    //  ------------------------------------------------------------------------ 
    handleBlur = (_e: Event) => {
        this.hasInteracted = true;
        this.updateValidity();
    }

    handleInput = (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target) { this.value = target.value; }
        this.updateValidity();
    }

    
    //  ------------------------------------------------------------------------
    //  Form association                                                                     
    //  ------------------------------------------------------------------------ 
    formResetCallback() {
        super.formResetCallback();
        // TODO: maybe we should link 
        // value and input value in a more central way.
        // This is kind of case by case right here.
        // Somehow this could be done on the setter of value?
        this.inputElement.value = this.value as string;
    }

    //  ------------------------------------------------------------------------
    //  Validation                                                                     
    //  ------------------------------------------------------------------------ 
    // This should be unimplemented in parent class
    protected updateValidity() {
        const { value } = this;
        if (value === '' && this.required) {
            this.internals.setValidity({
                valueMissing: true
            }, 'This field is required', this.inputElement);
        } else {
            this.internals.setValidity({});
        }

        this.setCustomStates();
    }

    private render() {
        this._shadowRoot.innerHTML = `
            <label for="input">${this.label}</label>
            <div class="input-wrapper">
                <input id="input" value="${this.value}"/>
            </div>
            <div class="error">ERROR</div>

        `;
    }
}

export default MInput;
