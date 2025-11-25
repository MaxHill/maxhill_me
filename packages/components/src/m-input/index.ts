import { MFormAssociatedElement } from "../utils/m-form-associated-element";
import { query } from "../utils/query";
import { BindAttribute } from "../utils/reflect-attribute";
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

// Text input specific
// TODO: tasks below
// - [ ] Selection range
// - [ ] SetRangeText
// - [ ] Clear button
// - [ ] Orientation
// - [ ] Size
// - [ ] Events
// - [ ] css parts
// - [x] before/after slots
// - [x] bind value to input.value to make defaultValue work
// - [x] constraint validation


/**
 * Text input custom element
 * 
 * @customElement
 * @tagname m-input
 * 
 * @slot - Default slot for component content
 * @slot clear - Slot where you can override the clear button.
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
        return [...super.observedAttributes, "type", "minlength", "maxlength", "pattern", "placeholder", "clearable", "autocomplete", "size"]
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

    @BindAttribute()
    autocomplete?: string;

    @BindAttribute()
    size?: number;

    // TODO: add "multiple" - Only applies to email and url.

    @BindAttribute()
    clearable: boolean = false;

    @query('slot[name="clear"]')
    private clearSlot!: HTMLSlotElement;
    get clearSlotHasContent() {
        return this.clearSlot?.assignedElements().length > 0;

    }



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
        // Update validity after rendering so inputElement exists
        this.updateValidity();

        this.toggleClearButton();

        this.inputElement.addEventListener("input", this.handleInput);
        this.inputElement.addEventListener("blur", this.handleBlur);
        this.clearSlot.addEventListener('click', this.handleClearClick);
    }

    disconnectedCallback() {
        super.disconnectedCallback()
        this.inputElement.removeEventListener("input", this.handleInput);
        this.inputElement.removeEventListener("blur", this.handleBlur);
        this.clearSlot.removeEventListener('click', this.handleClearClick);
    }

    attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
        super.attributeChangedCallback(name, oldValue, newValue);
        if (!this.inputElement) return;

        // Special case: label goes to labelElement
        if (name === "label") {
            this.labelElement.textContent = newValue as string || "";
            return;
        }

        // Attributes to forward directly to the inner input element
        const inputAttributes = [
            'type', 'disabled', 'readonly', 'required',
            'minlength', 'maxlength', 'pattern', 'placeholder', 
            'autocomplete', 'size'
        ];

        if (inputAttributes.includes(name)) {
            if (newValue != null) {
                this.inputElement.setAttribute(name, String(newValue));
            } else {
                this.inputElement.removeAttribute(name);
            }
        }

        // Note: parent's attributeChangedCallback already calls updateValidity()
        this.toggleClearButton();
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
        // Note: value setter already calls updateValidity()
        this.toggleClearButton();
    }


    private handleClearClick = (e: Event) => {
        e.preventDefault();
        this.value = '';
        this.inputElement.focus(); // Return focus to input
        this.toggleClearButton(); // Hide button after clearing
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
                    // TODO: a regex here is not great
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

        // Set validity on this element
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

    //  ------------------------------------------------------------------------
    //  Clear button                                                                     
    //  ------------------------------------------------------------------------ 
    private toggleClearButton() {
        if (!this.clearSlot) return;

        const shouldHide = !this.clearable ||
            !this.value ||
            this.disabled ||
            this.readonly;

        if (shouldHide) {
            this.clearSlot.setAttribute('hidden', '');
        } else {
            this.clearSlot.removeAttribute('hidden');
        }
    }

    private render() {
        this._shadowRoot.innerHTML = `
            <label for="input">${this.label || ''}</label>
            <div class="input-wrapper">
                <slot name="before"></slot>
                <input 
                id="input" 
                value="${this.value}"
                type="${this.type}"
                ${this.required ? 'required' : ''}
                ${this.readonly ? 'readonly' : ''}
                ${this.minLength != null ? `minlength="${this.minLength}"` : ''}
                ${this.maxLength != null ? `maxlength="${this.maxLength}"` : ''}
                ${this.pattern != null ? `pattern="${this.pattern}"` : ''}
                ${this.placeholder ? `placeholder="${this.placeholder}"` : ''}
                ${this.autocomplete != null ? `autocomplete="${this.autocomplete}"` : ''}
                ${this.size != null ? `size="${this.size}"` : ''}
            />
                <slot name="clear">
                    <button type="button" tabindex="-1" aria-label="Clear input">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                </slot>
                <slot name="after"></slot>
            </div>
            <div class="error"></div>

        `;
    }
}

export default MInput;
