import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import styles from "./index.css?inline";
import {
    MInputChangeEvent,
    MInputInputEvent,
    MInputBlurEvent,
    MInputFocusEvent,
    MInputInvalidEvent,
    MInputValidEvent,
    MInputSelectEvent
} from "./events";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * Form-associated text input web component with validation support
 * 
 * @customElement
 * @tagname m-input
 * 
 * @attr {string} value - Current input value
 * @attr {string} default-value - Default value (for form reset)
 * @attr {string} label - Label text for the input
 * @attr {string} placeholder - Placeholder text
 * @attr {string} type - Input type (text, email, password, tel, url, search)
 * @attr {string} name - Form field name
 * @attr {boolean} required - Whether the input is required
 * @attr {boolean} disabled - Whether the input is disabled
 * @attr {boolean} readonly - Whether the input is read-only
 * @attr {number} minlength - Minimum input length
 * @attr {number} maxlength - Maximum input length
 * @attr {string} pattern - Validation pattern (regex)
 * @attr {string} autocomplete - Autocomplete hint
 * @attr {string} error-message - Custom error message override
 * 
 * @prop {string} value - Current input value
 * @prop {string} defaultValue - Default value (for form reset)
 * @prop {string} label - Label text for the input
 * @prop {string} placeholder - Placeholder text
 * @prop {string} type - Input type
 * @prop {string} name - Form field name
 * @prop {boolean} required - Whether the input is required
 * @prop {boolean} disabled - Whether the input is disabled
 * @prop {boolean} readonly - Whether the input is read-only
 * @prop {number | null} minlength - Minimum input length
 * @prop {number | null} maxlength - Maximum input length
 * @prop {string} pattern - Validation pattern (regex)
 * @prop {string} autocomplete - Autocomplete hint
 * @prop {string} errorMessage - Custom error message override
 * @prop {ValidityState} validity - Native ValidityState object
 * @prop {string} validationMessage - Current validation message
 * @prop {boolean} willValidate - Whether the input participates in constraint validation
 * @prop {NodeList} labels - List of associated label elements
 * @prop {number | null} selectionStart - Start index of selected text
 * @prop {number | null} selectionEnd - End index of selected text
 * @prop {string | null} selectionDirection - Direction of selection (forward/backward/none)
 * 
 * @fires m-input-change - Fired when value changes and input loses focus. Detail: { value: string }
 * @fires m-input-input - Fired on every input event. Detail: { value: string }
 * @fires m-input-blur - Fired when input loses focus. Detail: { value: string }
 * @fires m-input-focus - Fired when input gains focus. Detail: { value: string }
 * @fires m-input-select - Fired when text is selected. Detail: { value: string } (selected text)
 * @fires m-input-invalid - Fired when validation fails. Detail: { validationMessage: string }
 * @fires m-input-valid - Fired when validation passes. Detail: { value: string }
 */
export class MInput extends MElement {
    static tagName = 'm-input';
    static observedAttributes = [
        'value',
        'default-value',
        'label',
        'placeholder',
        'type',
        'name',
        'required',
        'disabled',
        'readonly',
        'readOnly',
        'minlength',
        'maxlength',
        'pattern',
        'autocomplete',
        'error-message'
    ];

    static formAssociated = true;

    private _shadowRoot: ShadowRoot;
    private internals: ElementInternals;
    private inputId: string;
    private validationTriggered: boolean = false;

    private _value: string = '';

    // Value property - does NOT sync back to attribute (native behavior)
    get value(): string {
        // If _value is not set but value attribute exists, use it (for initial setup)
        if (!this._value && this.hasAttribute('value')) {
            this._value = this.getAttribute('value') || '';
        }
        return this._value;
    }

    set value(val: string) {
        this._value = val;
        
        // Sync the input element's value
        if (this.inputElement && this.inputElement.value !== this._value) {
            this.inputElement.value = this._value;
        }
        this.updateFormValue();
        this.updateAriaAttributes();
    }

    @BindAttribute({ attribute: 'default-value' })
    defaultValue: string = '';

    @BindAttribute()
    label: string = '';

    @BindAttribute()
    placeholder: string = '';

    @BindAttribute()
    type: 'text' | 'email' | 'password' | 'tel' | 'url' | 'search' = 'text';

    @BindAttribute()
    name: string = '';

    @BindAttribute()
    required: boolean = false;

    @BindAttribute()
    disabled: boolean = false;

    @BindAttribute({ attribute: 'readonly' })
    readOnly: boolean = false;

    // Not using @BindAttribute() because typeof undefined prevents proper number type detection
    // Handled manually in attributeChangedCallback instead
    minlength: number | undefined = undefined;

    maxlength: number | undefined = undefined;

    @BindAttribute()
    pattern: string = '';

    @BindAttribute()
    autocomplete: string = '';

    @BindAttribute({ attribute: 'error-message' })
    errorMessage: string = '';

    private inputElement!: HTMLInputElement;

    private errorElement!: HTMLElement;

    constructor() {
        super();
        this._shadowRoot = this.attachShadow({ mode: 'open', delegatesFocus: true });
        this._shadowRoot.adoptedStyleSheets = [baseStyleSheet];
        this.internals = this.attachInternals();
        this.inputId = crypto.randomUUID();
    }

    connectedCallback() {
        if (this.hasAttribute('value') && !this._value) {
            this._value = this.getAttribute('value') || '';
        }

        this.render();
        this.syncAttributesToInput();

        // Sync value to input element after render
        if (this.inputElement && this.inputElement.value !== this._value) {
            this.inputElement.value = this._value;
        }

        this.updateFormValue();
        this.updateAriaAttributes();
        
        // Native input doesn't reflect value property to attribute
        // Remove the attribute to match native behavior
        if (this.hasAttribute('value')) {
            this.removeAttribute('value');
        }
    }

    attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (name === 'value') {
            if (newValue !== null) {
                this._value = newValue as string;
                if (this.inputElement && this.inputElement.value !== this._value) {
                    this.inputElement.value = this._value;
                }
                this.updateFormValue();
            }
            this.removeAttribute('value');
        }

        if (name === 'minlength') {
            this.minlength = newValue ? Number(newValue) : undefined;
        }
        
        if (name === 'maxlength') {
            this.maxlength = newValue ? Number(newValue) : undefined;
        }

        this.syncAttributesToInput();

        if (['required', 'disabled', 'readonly', 'readOnly', 'minlength', 'maxlength', 'pattern', 'value'].includes(name)) {
            this.updateAriaAttributes();
        }
    }

    private render() {
        this._shadowRoot.innerHTML = `
            <label for="${this.inputId}">${this.label}</label>
            <div class="input-wrapper">
                <slot name="start"></slot>
                <input
                    id="${this.inputId}"
                    type="${this.type}"
                    placeholder="${this.placeholder}"
                    value="${this.value}"
                    name="${this.name}"
                    ${this.required ? 'required' : ''}
                    ${this.disabled ? 'disabled' : ''}
                    ${this.readOnly ? 'readonly' : ''}
                    ${this.minlength ? `minlength="${this.minlength}"` : ''}
                    ${this.maxlength ? `maxlength="${this.maxlength}"` : ''}
                    ${this.pattern ? `pattern="${this.pattern}"` : ''}
                    ${this.autocomplete ? `autocomplete="${this.autocomplete}"` : ''}
                />
                <slot name="end"></slot>
            </div>
            <div class="error" role="alert" aria-live="polite"></div>
        `;

        this.inputElement = this._shadowRoot.querySelector('input') as HTMLInputElement;
        this.errorElement = this._shadowRoot.querySelector('.error') as HTMLElement;

        this.inputElement.addEventListener('input', this.handleInput.bind(this));
        this.inputElement.addEventListener('change', this.handleChange.bind(this));
        this.inputElement.addEventListener('blur', this.handleBlur.bind(this));
        this.inputElement.addEventListener('focus', this.handleFocus.bind(this));
        this.inputElement.addEventListener('select', this.handleSelect.bind(this));
    }

    private syncAttributesToInput() {
        if (!this.inputElement) return;

        // Sync all relevant attributes to the internal input element
        this.inputElement.type = this.type;
        this.inputElement.placeholder = this.placeholder;
        this.inputElement.name = this.name;
        this.inputElement.required = this.required;
        this.inputElement.disabled = this.disabled;
        this.inputElement.readOnly = this.readOnly;
        
        if (this.minlength !== undefined) {
            this.inputElement.minLength = this.minlength;
        } else {
            this.inputElement.removeAttribute('minlength');
        }
        
        if (this.maxlength !== undefined) {
            this.inputElement.maxLength = this.maxlength;
        } else {
            this.inputElement.removeAttribute('maxlength');
        }
        
        if (this.pattern) {
            this.inputElement.pattern = this.pattern;
        } else {
            this.inputElement.removeAttribute('pattern');
        }
        
        this.inputElement.autocomplete = this.autocomplete as any;
    }

    private handleInput(event: Event) {
        const target = event.target as HTMLInputElement;
        this.value = target.value;
        this.dispatchEvent(new MInputInputEvent({ value: this.value }));
    }

    private handleChange(event: Event) {
        const target = event.target as HTMLInputElement;
        this.value = target.value;
        this.dispatchEvent(new MInputChangeEvent({ value: this.value }));
    }

    private handleBlur(_event: FocusEvent) {
        this.dispatchEvent(new MInputBlurEvent({ value: this.value }));
    }

    private handleFocus(_event: FocusEvent) {
        this.dispatchEvent(new MInputFocusEvent({ value: this.value }));
    }

    private handleSelect(event: Event) {
        const target = event.target as HTMLInputElement;
        const selectedText = target.value.substring(
            target.selectionStart ?? 0,
            target.selectionEnd ?? 0
        );
        this.dispatchEvent(new MInputSelectEvent({ value: selectedText }));
    }

    private updateFormValue() {
        if (this.disabled) {
            this.internals.setFormValue(null);
        } else {
            this.internals.setFormValue(this.value);
        }
    }

    private updateAriaAttributes() {
        if (!this.internals) return;
        
        // Set ARIA via ElementInternals (not setAttribute)
        this.internals.ariaInvalid = this.hasError() ? 'true' : 'false';
        this.internals.ariaRequired = this.required ? 'true' : null;
        this.internals.ariaDisabled = this.disabled ? 'true' : null;
        this.internals.ariaReadOnly = this.readOnly ? 'true' : null;
    }

    private hasError(): boolean {
        return this.validationTriggered && !!this.inputElement && !this.inputElement.validity.valid;
    }

    private getErrorMessage(): string {
        if (this.errorMessage) {
            return this.errorMessage;
        }
        
        // Fallback for environments where validationMessage is not properly supported
        const validity = this.inputElement.validity;
        const message = this.inputElement.validationMessage;
        
        if (message) {
            return message;
        }
        
        // Manual fallback messages
        if (validity.valueMissing) {
            return 'This field is required.';
        }
        if (validity.typeMismatch) {
            return 'Please enter a valid value.';
        }
        if (validity.patternMismatch) {
            return 'Please match the requested format.';
        }
        if (validity.tooShort) {
            return `Please use at least ${this.minlength} characters.`;
        }
        if (validity.tooLong) {
            return `Please use no more than ${this.maxlength} characters.`;
        }
        
        return 'Please enter a valid value.';
    }

    private validateInput() {
        if (!this.inputElement) return;
        
        const isValid = this.inputElement.validity.valid;
        
        if (isValid) {
            this.validationTriggered = false;
            this.clearError();
            this.dispatchEvent(new MInputValidEvent({ value: this.value }));
        } else {
            this.validationTriggered = true;
            const message = this.getErrorMessage();
            this.internals.setValidity(
                this.inputElement.validity,
                message,
                this.inputElement
            );
            this.showError(message);
            this.dispatchEvent(new MInputInvalidEvent({ validationMessage: message }));
        }
        
        this.updateAriaAttributes();
    }

    private showError(message: string) {
        if (this.errorElement) {
            this.errorElement.textContent = message;
            this.errorElement.style.display = 'block';
        }
    }

    private clearError() {
        if (this.errorElement) {
            this.errorElement.textContent = '';
            this.errorElement.style.display = 'none';
        }
        this.internals.setValidity({});
    }

    public checkValidity(): boolean {
        if (!this.inputElement) return true;

        // Punt validation completely to the internal input element
        return this.inputElement.checkValidity();
    }

    public reportValidity(): boolean {
        if (!this.inputElement) return true;

        const isValid = this.inputElement.checkValidity();
        this.validateInput();

        return isValid;
    }

    public setCustomValidity(message: string) {
        if (!this.inputElement) return;
        
        this.inputElement.setCustomValidity(message);
        
        if (message) {
            this.internals.setValidity(
                { customError: true },
                message,
                this.inputElement
            );
        } else {
            this.internals.setValidity({});
        }
    }

    get validity(): ValidityState {
        if (!this.inputElement) {
            return {
                valid: true,
                valueMissing: false,
                typeMismatch: false,
                patternMismatch: false,
                tooLong: false,
                tooShort: false,
                rangeUnderflow: false,
                rangeOverflow: false,
                stepMismatch: false,
                badInput: false,
                customError: false
            } as ValidityState;
        }

        // Punt validity to the internal input element
        return this.inputElement.validity;
    }

    get validationMessage(): string {
        if (!this.inputElement) return '';

        // Return the native input's validationMessage without triggering validation
        return this.inputElement.validationMessage || '';
    }

    get willValidate(): boolean {
        return !this.disabled && (this.inputElement?.willValidate || false);
    }

    get labels(): NodeList {
        return this.internals.labels ?? (document.createDocumentFragment().childNodes as NodeList);
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

    public focus() {
        this.inputElement?.focus();
    }

    public blur() {
        this.inputElement?.blur();
    }

    public select() {
        this.inputElement?.select();
    }

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

    // Form-associated custom element callbacks
    formResetCallback() {
        this.value = this.defaultValue;
        if (this.inputElement) {
            this.inputElement.value = this.defaultValue;
        }
        this.clearError();
        this.validationTriggered = false;
    }

    formDisabledCallback(disabled: boolean) {
        this.disabled = disabled;
    }

    formStateRestoreCallback(state: string, _mode: 'restore' | 'autocomplete') {
        this.value = state;
    }

    formAssociatedCallback(_form: HTMLFormElement | null) {
        // Form association handled automatically by ElementInternals
    }
}

export default MInput;
