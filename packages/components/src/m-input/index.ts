import { MFormAssociatedElement } from "../utils/m-form-associated-element";
import { query } from "../utils/query";
import { BindAttribute } from "../utils/reflect-attribute";
import { MInputClearEvent } from "./events";
import type { MInvalidEventDetail } from "../events";
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

// Text input specific
// TODO: tasks below
// - [ ] Orientation
// - [x] Events (m-input-clear, m-invalid from base class)
// - [x] Selection range
// - [x] SetRangeText
// - [x] Clear button
// - [x] Size
// - [x] css parts
// - [x] before/after slots
// - [x] bind value to input.value to make defaultValue work
// - [x] constraint validation


/**
 * Text input custom element
 *
 * m-input is a drop-in replacement for the text-type variants of the native input element, enhanced with features such as slots, a clear button, built-in validation styling, and full form participation.
 * 
 * @customElement
 * @tagname m-input
 * 
 * @slot - Default slot for component content
 * @slot before - Slot for content before the input element
 * @slot after - Slot for content after the input element
 * @slot clear - Slot where you can override the clear button
 * 
 * @attr {string} type - Input type (text, email, password, tel, url, search)
 * @attr {string} value - The input value
 * @attr {string} label - Label text for the input
 * @attr {string} name - Name for form submission
 * @attr {string} placeholder - Placeholder text
 * @attr {number} minlength - Minimum length validation
 * @attr {number} maxlength - Maximum length validation
 * @attr {string} pattern - Pattern validation regex
 * @attr {string} autocomplete - Autocomplete hint
 * @attr {number} size - Visual width in characters
 * @attr {boolean} required - Whether the field is required
 * @attr {boolean} disabled - Whether the input is disabled
 * @attr {boolean} readonly - Whether the input is readonly
 * @attr {boolean} clearable - Whether to show a clear button
 * @attr {boolean} autofocus - Whether the input should be focused on page load
 * 
 * @csspart label - The label element
 * @csspart input-wrapper - The wrapper containing the input and slots
 * @csspart input - The native input element
 * @csspart clear-button - The clear button
 * @csspart clear-icon - The icon inside the clear button
 * @csspart error - The error message container
 */
export class MInput extends MFormAssociatedElement {
    static tagName = 'm-input';

    static get observedAttributes() {
        return [...super.observedAttributes, "type", "minlength", "maxlength", "pattern", "placeholder", "clearable", "autocomplete", "size", "autofocus"]
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

    @BindAttribute()
    clearable: boolean = false;

    @BindAttribute()
    autofocus: boolean = false;

    @query('slot[name="clear"]')
    private clearSlot!: HTMLSlotElement;
    get clearSlotHasContent() {
        return this.clearSlot?.assignedElements().length > 0;

    }


    get selectionStart(): number | null {
        return this.inputElement?.selectionStart ?? null;
    }

    set selectionStart(value: number | null) {
        if (this.inputElement) {
            this.inputElement.selectionStart = value;
        }
    }

    get selectionEnd(): number | null {
        return this.inputElement?.selectionEnd ?? null;
    }

    set selectionEnd(value: number | null) {
        if (this.inputElement) {
            this.inputElement.selectionEnd = value;
        }
    }

    get selectionDirection(): 'forward' | 'backward' | 'none' | null {
        return (this.inputElement?.selectionDirection as 'forward' | 'backward' | 'none') ?? null;
    }

    set selectionDirection(value: 'forward' | 'backward' | 'none' | null) {
        if (this.inputElement) {
            this.inputElement.selectionDirection = value;
        }
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

        // Handle autofocus manually since it doesn't work automatically with Shadow DOM
        if (this.autofocus) {
            // Use requestAnimationFrame to ensure the element is fully connected
            requestAnimationFrame(() => {
                this.inputElement?.focus();
            });
        }
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
            'autocomplete', 'size', 'autofocus'
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

    /**
     * Update error UI when validation state changes
     */
    protected onValidationChange = (isValid: boolean, validationMessage: string) => {
        if (!this.errorElement) return;
        
        if (!isValid && this.hasInteracted) {
            // Show error when invalid and user has interacted
            this.errorElement.textContent = validationMessage;
        } else if (isValid) {
            // Clear error when valid
            this.errorElement.textContent = '';
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
        
        // Dispatch custom clear event with current value
        const clearEvent = new MInputClearEvent({ value: this.value as string });
        const shouldClear = this.dispatchEvent(clearEvent);
        
        // Only clear if event wasn't prevented
        if (shouldClear) {
            this.value = '';
            this.inputElement.focus(); // Return focus to input
            this.toggleClearButton(); // Hide button after clearing
        }
    }

    //  ------------------------------------------------------------------------
    //  Validation                                                                     
    //  ------------------------------------------------------------------------ 
    protected updateValidity() {
        if (!this.inputElement) {
            this.updateValidationState({}, '');
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

        // Update validation state (sets validity, custom states, and dispatches events)
        this.updateValidationState(validityState, validationMessage, this.inputElement);
    }

    //  ------------------------------------------------------------------------
    //  Selection ranges                                                                     
    //  ------------------------------------------------------------------------ 
    public setSelectionRange(start: number, end: number, direction?: 'forward' | 'backward' | 'none') {
        this.inputElement?.setSelectionRange(start, end, direction);
    }

    public setRangeText(replacement: string): void;
    public setRangeText(replacement: string, start: number, end: number, selectionMode?: 'select' | 'start' | 'end' | 'preserve'): void;
    public setRangeText(replacement: string, start?: number, end?: number, selectionMode?: 'select' | 'start' | 'end' | 'preserve'): void {
        if (!this.inputElement) return;
        
        if (start !== undefined && end !== undefined) {
            this.inputElement.setRangeText(replacement, start, end, selectionMode);
        } else {
            this.inputElement.setRangeText(replacement);
        }
        
        // Sync value after setRangeText modifies the input
        this.value = this.inputElement.value;
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
            <label part="label" for="input">${this.label || ''}</label>
            <div part="input-wrapper" class="input-wrapper">
                <slot name="before"></slot>
                <input 
                part="input"
                id="input" 
                value="${this.value}"
                type="${this.type}"
                ${this.required ? 'required' : ''}
                ${this.readonly ? 'readonly' : ''}
                ${this.autofocus ? 'autofocus' : ''}
                ${this.minLength != null ? `minlength="${this.minLength}"` : ''}
                ${this.maxLength != null ? `maxlength="${this.maxLength}"` : ''}
                ${this.pattern != null ? `pattern="${this.pattern}"` : ''}
                ${this.placeholder ? `placeholder="${this.placeholder}"` : ''}
                ${this.autocomplete != null ? `autocomplete="${this.autocomplete}"` : ''}
                ${this.size != null ? `size="${this.size}"` : ''}
            />
                <slot name="clear">
                    <button part="clear-button" type="button" tabindex="-1" aria-label="Clear input">
                        <svg part="clear-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                </slot>
                <slot name="after"></slot>
            </div>
            <div part="error" class="error"></div>

        `;
    }
}

export default MInput;
