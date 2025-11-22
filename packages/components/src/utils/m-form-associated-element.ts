import { MElement } from "./m-element";
import { BindAttribute } from "./reflect-attribute";

export abstract class MFormAssociatedElement extends MElement {
    protected internals: ElementInternals;

    static formAssociated = true;
    static observedAttributes = ['required', 'value','disabled', 'label', 'name'];

    @BindAttribute()
    label?: string;

    @BindAttribute()
    disabled = false;

    @BindAttribute()
    name?: string;

    // Original (or default) value of the element. 
    // It reflects the element's value attribute.
    @BindAttribute({attribute: "value"})
    defaultValue: string = '';

    private _value: string | FormData = '';
    get value() {
        return this._value
    }
    set value(value) {
        // Don't set value if the input is disabled
        if (this.disabled) return;

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
    }

    //  ------------------------------------------------------------------------
    //  Constraint validation                                                                     
    //  ------------------------------------------------------------------------ 
    @BindAttribute()
    required = false;

    protected hasInteracted = false;


    constructor() {
        super();

        this.internals = this.attachInternals();
        // TODO: maybe this won't work in list inputs
        this.value = this.defaultValue;
    }

    connectedCallback() {
        this.firstUpdate();
        this.addEventListener("invalid", this.handleInvalid);
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
    }

    //  ------------------------------------------------------------------------
    //  Event handlers                                                                     
    //  ------------------------------------------------------------------------ 
    handleInvalid = (e: Event) => {
        // Don't show native ui
        e.preventDefault();
        this.hasInteracted = true;
        this.updateValidity();
        this.focus();
    }
    //  ------------------------------------------------------------------------
    //  Form association                                                                     
    //  ------------------------------------------------------------------------ 
    protected firstUpdate() {
        this.internals.setFormValue(this.value);
        this.updateValidity();
    }

    formResetCallback() {
        this.value = this.defaultValue;
        this.hasInteracted = false;
        this.setCustomStates();
    }

    formDisabledCallback(disabled: boolean) {
        this.disabled = disabled;
    }

    formStateRestoreCallback(state: string, _mode: 'restore' | 'autocomplete') {
        this.value = state;
    }

    //  ------------------------------------------------------------------------
    //  Validation                                                                     
    //  ------------------------------------------------------------------------ 
    protected setCustomStates() {
        const isValid = this.internals.validity.valid;
        this.setState('invalid', !isValid);
        this.setState('valid', isValid);
        this.setState('user-invalid', !isValid && this.hasInteracted);
        this.setState('user-valid', isValid && this.hasInteracted);
    }

    protected abstract updateValidity(): void;

    //  ------------------------------------------------------------------------
    //  Helpers                                                                     
    //  ------------------------------------------------------------------------ 
    private setState(name: string, condition: boolean) {
        if (condition) { this.internals.states.add(name) }
        else { this.internals.states.delete(name) }
    }

}
