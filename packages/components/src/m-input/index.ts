import { MFormAssociatedElement } from "../utils/m-form-associated-element";
import { query } from "../utils/query";
import { BindAttribute } from "../utils/reflect-attribute";
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

// Text input specific
// TODO: Selection range
// TODO: setRangeText
// TODO: bind value to input.value to make defaultValue work
// TODO: before/after slots
// TODO: constraint validation


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
        return [...super.observedAttributes, "type", "minlength", "maxlength", "pattern", "placeholder"]
    }

    private _shadowRoot: ShadowRoot;

    @query('input')
    private inputElement!: HTMLInputElement;

    @query('label')
    private labelElement!: HTMLInputElement;

    @query('.error')
    private errorElement!: HTMLInputElement;

    @BindAttribute()
    type: "text" | "search" | "tel" | "url" | "email" | "password" = "text"

    @BindAttribute({ attribute: "minlength" })
    minLength?: number;

    @BindAttribute({ attribute: "maxlength" })
    maxLength?: number;

    @BindAttribute()
    pattern?: string;

    @BindAttribute()
    placeholder?: string;

    // TODO: add "size" {number} - Width in characters of the input 
    // TODO: add "multiple" - Only applies to email and url.
    // TODO: add "autocomplete" {boolean}


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
        super.connectedCallback()

        this.render();

        this.inputElement.addEventListener("input", this.handleInput);
        this.inputElement.addEventListener("blur", this.handleBlur);
    }

    disconnectedCallback() {
        super.disconnectedCallback()
        this.inputElement.removeEventListener("input", this.handleInput);
        this.inputElement.removeEventListener("blur", this.handleBlur);
    }

    attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (!this.inputElement) return;

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

        if (name === "type") {
            this.inputElement.setAttribute("type", this.type);
        }

        if (name === "required") {
            if (this.required) {
                this.inputElement.setAttribute("required", "");
            } else {
                this.inputElement.removeAttribute("required");
            }
        }

        if (name === "minlength") {
            if (this.minLength != null) {
                this.inputElement.setAttribute("minlength", String(this.minLength));
            } else {
                this.inputElement.removeAttribute("minlength");
            }
        }

        if (name === "maxlength") {
            if (this.maxLength != null) {
                this.inputElement.setAttribute("maxlength", String(this.maxLength));
            } else {
                this.inputElement.removeAttribute("maxlength");
            }
        }

        if (name === "pattern") {
            if (this.pattern != null) {
                this.inputElement.setAttribute("pattern", this.pattern);
            } else {
                this.inputElement.removeAttribute("pattern");
            }
        }

        if (name === "placeholder") {
            if (this.placeholder) {
                this.inputElement.setAttribute("placeholder", this.placeholder);
            } else {
                this.inputElement.removeAttribute("placeholder");
            }
        }

        // Update validity after attribute changes
        this.updateValidity();
    }

    /**
     * Tie wrapped native input value to m-input value
     */
    protected onValueChange = (value: string | string[]) => {
        if (Array.isArray(value)) {
            console.error("trying to set array value to string input", this.tagName, value);
            return;
        }
        if (this.inputElement) {
            this.inputElement.value = value;
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
    //  Validation                                                                     
    //  ------------------------------------------------------------------------ 
    // This should be unimplemented in parent class
    protected updateValidity() {
        if (!this.inputElement) {
            this.internals.setValidity({});
            this.setCustomStates();
            return;
        }
        const value = this.value as string;
        const validityState: ValidityStateFlags = {};
        let validationMessage = '';
        // 1. Check valueMissing (required)
        if (this.required && !value) {
            validityState.valueMissing = true;
            validationMessage = 'This field is required';
        }
        // 2. Check tooShort (minlength) - only if value is not empty
        else if (this.minLength != null && value.length > 0 && value.length < this.minLength) {
            validityState.tooShort = true;
            validationMessage = `Please lengthen this text to ${this.minLength} characters or more (you are currently using ${value.length} characters).`;
        }
        // 3. Check tooLong (maxlength) - browser usually prevents this, but check anyway
        else if (this.maxLength != null && value.length > this.maxLength) {
            validityState.tooLong = true;
            validationMessage = `Please shorten this text to ${this.maxLength} characters or less (you are currently using ${value.length} characters).`;
        }
        // 4. Check patternMismatch - only if value is not empty
        else if (this.pattern && value.length > 0) {
            const regex = new RegExp(this.pattern);
            if (!regex.test(value)) {
                validityState.patternMismatch = true;
                validationMessage = `Please match the requested format.`;
            }
        }
        // 5. Check typeMismatch based on input type
        else if (value.length > 0) {
            switch (this.type) {
                case 'email':
                    // Simple email validation
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(value)) {
                        validityState.typeMismatch = true;
                        validationMessage = 'Please enter a valid email address.';
                    }
                    break;
                case 'url':
                    try {
                        new URL(value);
                    } catch {
                        validityState.typeMismatch = true;
                        validationMessage = 'Please enter a valid URL.';
                    }
                    break;
                // tel, search, password, text don't have type validation
            }
        }

        // Set validity on the custom element
        if (Object.keys(validityState).length > 0) {
            this.internals.setValidity(
                validityState,
                validationMessage,
                this.inputElement
            );
            this.errorElement.textContent = validationMessage;
        } else {
            this.internals.setValidity({});
        }

        this.setCustomStates();
    }

    private render() {
        this._shadowRoot.innerHTML = `
            <label for="input">${this.label}</label>
            <div class="input-wrapper">
                <slot name="start"></slot>
                <input 
                id="input" 
                value="${this.value}"
                type="${this.type}"
                ${this.required ? 'required' : ''}
                ${this.minLength != null ? `minlength="${this.minLength}"` : ''}
                ${this.maxLength != null ? `maxlength="${this.maxLength}"` : ''}
                ${this.pattern != null ? `pattern="${this.pattern}"` : ''}
                ${this.placeholder ? `placeholder="${this.placeholder}"` : ''}
            />
                <slot name="end"></slot>
            </div>
            <div class="error"></div>

        `;
    }

    //  ------------------------------------------------------------------------
    //  Utils                                                                     
    //  ------------------------------------------------------------------------ 
    syncAttributesToWrappedInput() {
    }
}

export default MInput;
