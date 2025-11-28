import { MElement } from "./m-element";
import { BindAttribute } from "./reflect-attribute";
import { MInvalidEvent } from "../events";


/**
 * 
 * Base class for creating a form associated element. Use this as a base to 
 * conform to how form elements work and get a lot of boilerplate setup.
 * 
 * Value property is automatically synced to formValue
 *
 */
export abstract class MFormAssociatedElement extends MElement {

    static observedAttributes = ['required', 'value', 'disabled', 'readonly', 'label', 'name'];

    /**
     * Enables constraint validation, default aria attributes, and fully 
     * participate in HTMLForms
     */
    protected internals: ElementInternals;

    /**
     * Enables form participation for the element with attributes such as value and name 
     */
    static formAssociated = true;



    /**
     * Label that can be used in the ui and also set as the aria-label
     */
    @BindAttribute()
    label?: string;

    /**
     * Whether the element is disabled. When disabled, tabindex is set to -1
     */
    @BindAttribute()
    disabled = false;

    /**
     * Whether the element is readonly. When readonly, user cannot edit 
     * but value is still submitted with forms and can be updated programmatically.
     */
    @BindAttribute()
    readonly = false;

    /**
     * Name associated with the value when submitted in a form
     */
    @BindAttribute()
    name?: string;

    /**
     * Original (or default) value of the element. 
     * It reflects the element's value attribute.
     * This is used on form reset
     */
    @BindAttribute({ attribute: "value" })
    defaultValue: string = '';

    private _value: string | string[] = '';
    /**
     *
     * @returns {string|string[]} - The value of the element
     */
    get value(): string | string[] {
        return this._value
    }

    /**
     * @param {string|string[]} value - sets both the value and the form value for the element
     */
    set value(value: string | string[]) {
        // Don't set value if the element is disabled
        if (this.disabled) return;
        if (this.value === value) return;

        if (Array.isArray(value)) {
            if (this.name) {
                const formData = new FormData();
                for (const val of value) {
                    formData.append(this.name, val as string);
                }
                this._value = value;
                this.internals.setFormValue(formData);
            }
        } else {
            this._value = value;
            this.internals.setFormValue(value)
        }

        this.onValueChange && this.onValueChange(value)
        this.updateValidity()
    }

    /**
     * Implement this to hook into when the value is updated
     */
    protected onValueChange?: (value: string | string[]) => void;

    //  ------------------------------------------------------------------------
    //  Constraint validation                                                                     
    //  ------------------------------------------------------------------------ 
    /**
     * If the field is required, part of Constraint validation. 
     */
    @BindAttribute()
    required = false;


    /**
     * Tracks whether the user has interacted with the element in a way that
     * warrants showing validation feedback (e.g., blur, form submit attempt).
     * Used to determine when to apply user-invalid and user-valid states.
     */
    protected hasInteracted = false;

    /**
     * Tracks the previous validation message to avoid dispatching duplicate m-invalid events
     */
    private _previousValidationMessage: string = '';

    constructor() {
        super();

        this.internals = this.attachInternals();
    }

    connectedCallback() {
        this.addEventListener("invalid", this.handleInvalid);
        
        if (this.defaultValue) {
            this.value = this.defaultValue;
        }
        
        // Note: updateValidity() should be called by subclasses after they render their DOM
        // TODO: fix this behavior
    }
    
    disconnectedCallback() {
        this.removeEventListener("invalid", this.handleInvalid);
    }

    attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
        super.attributeChangedCallback(name, oldValue, newValue);
        this.updateValidity();


        if (name === "label") {
            this.internals.ariaLabel = newValue as string;
        }


        if (name === "disabled") {
            if (this.disabled) {
                this.setAttribute("tabindex", "-1");
            } else {
                this.setAttribute("tabindex", "0");
            }
        }
    }

    //  ------------------------------------------------------------------------
    //  Event handlers                                                                     
    //  ------------------------------------------------------------------------ 
    handleInvalid = (e: Event) => {
        // Prevent native validation bubble and focus handling
        // (native browser can't focus through shadow DOM, so we handle it ourselves)
        e.preventDefault();
        
        // Update custom validation state
        this.hasInteracted = true;
        this.updateValidity();
        
        // Focus the first invalid element only
        const form = this.internals.form;
        if (form) {
            // Mark that we've seen an invalid event in this validation cycle
            if (!(form as any)._hasInvalidEvent) {
                // This is the first invalid element
                (form as any)._hasInvalidEvent = true;
                this.focus();
                // Clear the flag after the current event loop to be ready for next submit
                setTimeout(() => { delete (form as any)._hasInvalidEvent; }, 0);
            }
        } else {
            // No form, just focus
            this.focus();
        }
    }

    //  ------------------------------------------------------------------------
    //  Form lifecycle                                                                    
    //  ------------------------------------------------------------------------ 

    /** 
     * Called when the form is reset. Should clear the value and reset states 
     * and interaction.
     * */
    formResetCallback() {
        this.value = this.defaultValue;
        this.hasInteracted = false;
        this.updateValidationState({}, '');
    }


    /**
     * Called when the whole form is disabled/enabled.
     * @param {boolean} disabled - If the form is disabled/enabled
     */
    formDisabledCallback(disabled: boolean) {
        this.disabled = disabled;
    }


    /**
     * @param {string} state - value to be set
     * @param {"restore" | "autocomplete"} _mode - is it called by "restore" (going back in the browser after form submission for example) or autocomplete?
     */
    formStateRestoreCallback(state: string, _mode: 'restore' | 'autocomplete') {
        this.value = state;
    }

    //  ------------------------------------------------------------------------
    //  Validation                                                                     
    //  ------------------------------------------------------------------------ 

    /**
     * Updates validation state including internals.validity, custom states, and dispatches events.
     * Call this method with validation results instead of calling internals.setValidity() directly.
     * 
     * @param validityState - The ValidityStateFlags object describing validation errors
     * @param validationMessage - Human-readable error message
     * @param anchor - Optional anchor element for constraint validation API
     */
    protected updateValidationState(
        validityState: ValidityStateFlags, 
        validationMessage: string = '', 
        anchor?: HTMLElement
    ): void {
        // Set validity on internals
        if (Object.keys(validityState).length > 0) {
            this.internals.setValidity(validityState, validationMessage, anchor);
        } else {
            this.internals.setValidity({});
        }

        // Update custom states for :state() pseudo-classes
        const isValid = this.internals.validity.valid;
        this.setState('invalid', !isValid);
        this.setState('valid', isValid);
        this.setState('user-invalid', !isValid && this.hasInteracted);
        this.setState('user-valid', isValid && this.hasInteracted);

        // Update ARIA attributes for accessibility
        this.internals.ariaInvalid = !isValid ? 'true' : 'false';

        // Dispatch m-invalid event when invalid (avoid duplicates)
        if (!isValid && this._previousValidationMessage !== validationMessage) {
            this.dispatchEvent(new MInvalidEvent({
                validity: this.internals.validity,
                validationMessage,
                value: this.value
            }));
            this._previousValidationMessage = validationMessage;
        } else if (isValid) {
            this._previousValidationMessage = '';
        }
    }


    /**
     * Implement this method to validate the element's value. Should calculate
     * validation state and call updateValidationState() with the results.
     */
    protected abstract updateValidity(): void;

    //  ------------------------------------------------------------------------
    //  Helpers                                                                     
    //  ------------------------------------------------------------------------ 


    /**
     * @param {string} name - Name of the state
     * @param {boolean} condition - Whether the state should be added or removed
     */
    private setState(name: string, condition: boolean) {
        if (condition) { this.internals.states.add(name) }
        else { this.internals.states.delete(name) }
    }

}
