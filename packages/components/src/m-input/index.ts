import { MElement } from "../utils/m-element";
import { query } from "../utils/query";
import { BindAttribute } from "../utils/reflect-attribute";
import styles from "./index.css?inline";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

// TODO: formResetCallback()
// TODO: formDisabledCallback(disabled: boolean)
// TODO: formStateRestoreCallback(state: string, _mode: 'restore' | 'autocomplete')
// TODO: formAssociatedCallback(_form: HTMLFormElement | null)

// Text input specific
// TODO: Selection range
// TODO: setRangeText



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
export class MInput extends MElement {
    static tagName = 'm-input';
    static formAssociated = true;
    static observedAttributes = ['required', 'value'];

    private _shadowRoot: ShadowRoot;
    private internals: ElementInternals;

    defaultValue: string = '';
    private _value: string = '';
    get value() {
        return this._value
    }
    set value(value) {
        this._value = value;
        this.internals.setFormValue(value)
    }

    //  ------------------------------------------------------------------------
    //  Constraint validation                                                                     
    //  ------------------------------------------------------------------------ 
    private hasInteracted = false;
    @BindAttribute()
    required = false;




    //  ------------------------------------------------------------------------
    // INPUT SPECIFIC
    @query('input')
    private inputElement!: HTMLInputElement;
    select() {
        this.inputElement?.select();
    }
    focus(options?: FocusOptions) {
        this.inputElement?.focus(options);
    }
    blur() {
        this.inputElement?.blur();
    }
    // INPUT SPECIFIC
    //  ------------------------------------------------------------------------

    constructor() {
        super();
        this._shadowRoot = this.attachShadow({
            mode: 'open',
            //  ------------------------------------------------------------------------
            // INPUT SPECIFIC
            delegatesFocus: true
        });
        this._shadowRoot.adoptedStyleSheets = [baseStyleSheet];
        // END INPUT SPECIFIC
        //  ------------------------------------------------------------------------
        this.internals = this.attachInternals();
        this.defaultValue = this.value;
    }

    connectedCallback() {
        this.render();
        this.firstUpdate();

        //  ------------------------------------------------------------------------
        // INPUT SPECIFIC
        this.inputElement.addEventListener("input", this.handleInput);
        this.inputElement.addEventListener("blur", this.handleBlur);
        this.addEventListener("invalid", this.handleInvalid);
        // END INPUT SPECIFIC
        //  ------------------------------------------------------------------------
    }

    disconnectedCallback() {
        //  ------------------------------------------------------------------------
        // INPUT SPECIFIC
        this.inputElement.removeEventListener("input", this.handleInput);
        this.inputElement.removeEventListener("blur", this.handleBlur);
        this.removeEventListener("invalid", this.handleInvalid);
        // END INPUT SPECIFIC
        //  ------------------------------------------------------------------------
    }

    attributeChangedCallback(name: string, oldValue: unknown, newValue: unknown) {
        super.attributeChangedCallback(name, oldValue, newValue);
        this.updateValidity();
    }


    //  ------------------------------------------------------------------------
    //  Event handlers                                                                     
    //  ------------------------------------------------------------------------ 
    handleInvalid = (e: Event) => {
        e.preventDefault();// Don't show native ui
        this.hasInteracted = true;
        this.updateValidity();
    }
    handleBlur = (_e: Event) => {
        this.hasInteracted = true;
        this.updateValidity();
    }

    handleInput = (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target) {
            this.value = target.value;
        }
        this.hasInteracted = true;
        this.updateValidity();
    }

    //  ------------------------------------------------------------------------
    //  Form association                                                                     
    //  ------------------------------------------------------------------------ 
    private firstUpdate() {
        this.internals.setFormValue(this.value);
        this.updateValidity();
    }

    //  ------------------------------------------------------------------------
    //  Constraint Validation                                                                     
    //  ------------------------------------------------------------------------ 
    private setCustomStates() {
        const isValid = this.internals.validity.valid;
        this.setState('invalid', !isValid);
        this.setState('valid', isValid);
        this.setState('user-invalid', !isValid && this.hasInteracted);
        this.setState('user-valid', isValid && this.hasInteracted);
    }

    private updateValidity() {
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


    //  ------------------------------------------------------------------------
    //  Helpers                                                                     
    //  ------------------------------------------------------------------------ 
    private setState(name: string, condition: boolean) {
        if (condition) { this.internals.states.add(name) }
        else { this.internals.states.delete(name) }
    }

    private render() {
        this._shadowRoot.innerHTML = `
            <label for="input"><slot></slot></label>
            <input id="input"/>
            <div class="error">ERROR</div>
        `;
    }
}

export default MInput;
