import { MFormAssociatedElement } from "../utils/m-form-associated-element";
import { BindAttribute } from "../utils/reflect-attribute";
import { OutsideClickController } from "../utils/outside-click-controller";
import type { MOption } from "../m-option";
import { MListboxSelectEvent, MListboxUnselectedEvent, MListboxChangeEvent, MListboxFocusChangeEvent } from "./events";
import styles from "./index.css?inline";
import { OptionListManager, type OptionLike, type SelectionResult, type SelectionMode } from "../utils/option-list-manager";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * A form-associated listbox component for single or multiple selection.
 * Supports keyboard navigation, form integration, and accessible selection patterns.
 * 
 * @customElement
 * @tagname m-listbox
 * 
 * @slot - The default slot accepts m-option elements
 * 
 * @attr {string} name - The form control name for form submission
 * @attr {string} label - Accessible label (also sets aria-label)
 * @attr {boolean} multiple - Whether multiple options can be selected (default: false)
 * @attr {boolean} disabled - Whether the listbox is disabled (inherited from base)
 * @attr {boolean} required - Whether selection is required for form validation (inherited from base)
 * @attr {boolean} readonly - Whether the listbox is readonly (inherited from base)
 * @attr {string} skip - CSS selector for options to skip in keyboard navigation
 * @attr {string} value - Initial value to select
 * 
 * @prop {string | string[] | null} value - Current value (string in single-select, array in multiple-select, null when empty)
 * @prop {string[]} selectedValues - Array of all selected option values
 * @prop {MOption[]} selectedOptions - Array of all selected option elements
 * @prop {MOption[]} options - Array of all available option elements
 * @prop {boolean} multiple - Whether multiple selection is enabled
 * @prop {boolean} disabled - Whether the listbox is disabled
 * @prop {boolean} required - Whether selection is required
 * @prop {boolean} readonly - Whether the listbox is readonly
 * @prop {HTMLFormElement | null} form - The associated form element (readonly)
 * @prop {string} name - The form control name
 * @prop {string} label - The accessible label
 * 
 * @fires {MListboxSelectEvent} m-listbox-select - Fired when an option is selected. Detail: { item: MOption, selected: boolean }
 * @fires {MListboxUnselectedEvent} m-listbox-unselected - Fired when an option is unselected. Detail: { item: MOption, selected: boolean }
 * @fires {MListboxChangeEvent} m-listbox-change - Fired when the selection changes. Detail: { selected: string[] }
 * @fires {MListboxFocusChangeEvent} m-listbox-focus-change - Fired when focus moves to a different option. Detail: { item: MOption | null }
 * @fires {Event} change - Standard change event (bubbles)
 * @fires {MInvalidEvent} m-invalid - Fired when validation fails (inherited). Detail: { validity, validationMessage, value }
 * 
 * @example
 * ```html
 * <!-- Single selection -->
 * <m-listbox name="fruit" label="Choose a fruit">
 *   <m-option value="apple">Apple</m-option>
 *   <m-option value="banana">Banana</m-option>
 *   <m-option value="orange">Orange</m-option>
 * </m-listbox>
 * 
 * <!-- Multiple selection -->
 * <m-listbox name="colors" label="Choose colors" multiple>
 *   <m-option value="red">Red</m-option>
 *   <m-option value="green">Green</m-option>
 *   <m-option value="blue">Blue</m-option>
 * </m-listbox>
 * 
 * <!-- With validation -->
 * <m-listbox name="country" label="Country" required>
 *   <m-option value="us">United States</m-option>
 *   <m-option value="uk">United Kingdom</m-option>
 * </m-listbox>
 * ```
 */
export class MListbox extends MFormAssociatedElement {
    static tagName = 'm-listbox';
    static formAssociated = true;
    static observedAttributes = [...MFormAssociatedElement.observedAttributes, 'multiple', 'skip'];

    @BindAttribute()
    multiple: boolean = false;

    @BindAttribute()
    skip?: string;

    private tabIndexBeforeDisable: string | null = null;

    private outsideClickController?: OutsideClickController;
    private optionListManager!: OptionListManager;

    /*** ----------------------------
     *  Getters 
     * ----------------------------- */
    /**
     * Returns all available option elements in the listbox.
     * Includes both selected and unselected options.
     * Excludes hidden and disabled options based on the skip attribute.
     */
    get options(): MOption[] {
        return this.optionListManager.options as MOption[];
    }

    /**
     * Returns all currently selected option elements.
     * In single-select mode, returns array with 0 or 1 element.
     * In multiple-select mode, returns array with 0 or more elements.
     */
    get selectedOptions(): MOption[] {
        return this.optionListManager.selectedOptions as MOption[];
    }

    /**
     * Returns the values of all currently selected options.
     * In single-select mode, returns array with 0 or 1 string.
     * In multiple-select mode, returns array with 0 or more strings.
     */
    get selectedValues(): string[] {
        return this.optionListManager.selectedValues;
    }

    /**
     * Returns the associated form element, if any.
     * Returns null if the listbox is not inside a form.
     */
    get form(): HTMLFormElement | null {
        return this.internals.form;
    }

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<slot></slot>`;
        shadow.adoptedStyleSheets = [baseStyleSheet];

        if (!this.hasAttribute("tabindex")) {
            this.tabIndex = 0;
        }

        this.optionListManager = this.createOptionListManager();
    }

    /*** ----------------------------
     *  OptionListManager Setup
     * ----------------------------- */

    /**
     * Creates and configures the OptionListManager instance.
     * Builds the selector with skip support and sets up callbacks.
     */
    private createOptionListManager(): OptionListManager {
        const baseSelector = "m-option:not([hidden]):not([disabled])";
        const selector = this.skip
            ? `${baseSelector}:not(${this.skip})`
            : baseSelector;

        const selectionMode: SelectionMode = this.multiple ? "multiple" : "single-select";
        return new OptionListManager(
            this,
            selector,
            {
                selectCallback: (result: SelectionResult) => this.handleSelectCallback(result),
                focusCallback: (option: OptionLike) => this.handleFocusCallback(option)
            },
            selectionMode,
            { dom: "light" }
        );
    }

    /**
     * Callback invoked when selection changes via OptionListManager.
     * Dispatches selection events and updates form value.
     */
    private handleSelectCallback(result: SelectionResult): void {
        // Dispatch unselect events for deselected options
        result.itemsToDeselect.forEach(i => {
            this.dispatchEvent(
                new MListboxUnselectedEvent({ item: i as MOption, selected: false })
            );
        });

        // Dispatch select or unselect event for the target option
        const option = result.itemToSelect as MOption;
        const EventClass = option.selected ? MListboxSelectEvent : MListboxUnselectedEvent;
        this.dispatchEvent(
            new EventClass({ item: option, selected: option.selected! })
        );

        // Get selected values once and reuse
        const selectedValues = this.optionListManager.selectedValues;
        
        // Dispatch change events
        this.dispatchEvent(
            new MListboxChangeEvent({ selected: selectedValues })
        );
        this.dispatchEvent(new Event('change', { bubbles: true }));

        // Update form value via base class setter
        this.value = this.multiple ? selectedValues : (selectedValues[0] ?? null);
    }

    /**
     * Callback invoked when focus changes via OptionListManager.
     * Updates aria-activedescendant and dispatches focus change event.
     */
    private handleFocusCallback(option: OptionLike): void {
        if (!option) {
            console.warn('handleFocusCallback called with null/undefined option');
            this.removeAttribute("aria-activedescendant");
            return;
        }
        const mOption = option as MOption;

        if (!mOption.id) {
            console.error('MOption missing required id attribute', mOption);
            return;
        }

        this.setAttribute("aria-activedescendant", mOption.id);
        this.dispatchEvent(new MListboxFocusChangeEvent({ item: mOption }));
    }

    /*** ----------------------------
     *  Focus Management - Delegated to OptionListManager
     * ----------------------------- */
    /**
     * Sets virtual focus to a specific option.
     * Updates aria-activedescendant and triggers focus state on the option.
     * Does nothing if option is null.
     * 
     * @param option - The option to focus, or null to do nothing
     */
    setFocus(option: MOption | null): void {
        if (!option) return;
        this.optionListManager.focus(option);
    }

    /**
     * Moves virtual focus to the first available option.
     * Wraps to first if already at the end.
     */
    focusFirst(): void {
        this.optionListManager.focusFirst();
    }

    /**
     * Moves virtual focus to the last available option.
     * Wraps to last if already at the beginning.
     */
    focusLast(): void {
        this.optionListManager.focusLast();
    }

    /**
     * Moves virtual focus to the next option in the list.
     * Wraps to the first option if currently on the last.
     */
    focusNext(): void {
        this.optionListManager.focusNext();
    }

    /**
     * Moves virtual focus to the previous option in the list.
     * Wraps to the last option if currently on the first.
     */
    focusPrev(): void {
        this.optionListManager.focusPrev();
    }

    /**
     * Removes virtual focus from all options.
     * Clears the aria-activedescendant attribute.
     */
    focusBlur(): void {
        this.optionListManager.focusBlur();
    }

    /*** ----------------------------
     *  Selection Management - Delegated to OptionListManager
     * ----------------------------- */
    /**
     * Selects the currently focused option.
     * In single-select mode, deselects all other options.
     * In multiple-select mode, toggles the focused option's selection.
     */
    selectFocused(): void {
        this.optionListManager.selectFocused();
    }

    /**
     * Selects the first available option.
     * In single-select mode, deselects all other options.
     */
    selectFirst(): void {
        this.optionListManager.selectFirst();
    }

    /**
     * Selects the last available option.
     * In single-select mode, deselects all other options.
     */
    selectLast(): void {
        this.optionListManager.selectLast();
    }

    /**
     * Selects the next option after the currently selected one.
     * In single-select mode, deselects all other options.
     * Wraps to first if currently on last.
     */
    selectNext(): void {
        this.optionListManager.selectNext();
    }

    /**
     * Selects the previous option before the currently selected one.
     * In single-select mode, deselects all other options.
     * Wraps to last if currently on first.
     */
    selectPrev(): void {
        this.optionListManager.selectPrev();
    }

    /*** ----------------------------
     *  Lifecycle
     * ----------------------------- */
    connectedCallback(): void {
        this.setAttribute("role", "listbox");

        if (this.multiple) {
            this.setAttribute("aria-multiselectable", "true");
        }

        if (this.disabled) {
            this.setAttribute("aria-disabled", "true");
            this.tabIndexBeforeDisable = this.getAttribute("tabindex");
            this.setAttribute("tabindex", "-1");
        }

        this.addEventListener('keydown', this.handleKeydown);
        this.addEventListener('focus', this.handleFocus, true);
        this.addEventListener('blur', this.handleBlur, true);
        this.addEventListener('click', this.handleClick);
        this.addEventListener('mouseover', this.handleMouseOver);
        this.addEventListener('mouseout', this.handleMouseOut);

        this.outsideClickController = new OutsideClickController(
            this,
            () => {
                this.blur();
            }
        );
        this.outsideClickController.connect();

        // Initialize value from either the value attribute or pre-selected options
        const valueAttr = this.getAttribute('value');
        if (valueAttr) {
            // If value attribute is set, select the matching option
            const matchingOption = this.options.find(option => option.value === valueAttr);
            if (matchingOption && !matchingOption.selected) {
                this.select(matchingOption);
            }
        } else {
            // Otherwise, sync value from any pre-selected options
            const selectedOptions = this.options.filter(option => option.selected);
            if (selectedOptions.length > 0) {
                const selectedValues = selectedOptions.map(option => option.value);
                this.value = this.multiple ? selectedValues : selectedValues[0];
            }
        }
    }

    disconnectedCallback(): void {
        this.removeEventListener('keydown', this.handleKeydown);
        this.removeEventListener('focus', this.handleFocus, true);
        this.removeEventListener('blur', this.handleBlur, true);
        this.removeEventListener('click', this.handleClick);
        this.removeEventListener('mouseover', this.handleMouseOver);
        this.removeEventListener('mouseout', this.handleMouseOut);

        this.outsideClickController?.disconnect();
    }


    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (name === 'label') {
            // Set aria-label for accessibility (base class sets internals.ariaLabel)
            this.setAttribute("aria-label", newValue || "");
        }
        if (name === 'skip') {
            // Rebuild manager with new selector
            this.optionListManager = this.createOptionListManager();
        }
        if (name === 'multiple') {
            // Rebuild manager with new selection mode
            this.optionListManager = this.createOptionListManager();
            this.options.forEach(option => (option.selected = false));
            this.optionListManager.focusedElement = null;
            this.value = null;
            if (this.multiple) {
                this.setAttribute("aria-multiselectable", "true");
            } else {
                this.removeAttribute("aria-multiselectable");
            }
        }
        if (name === 'disabled') {
            if (this.disabled) {
                this.setAttribute("aria-disabled", "true");
                this.tabIndexBeforeDisable = this.getAttribute("tabindex");
                this.setAttribute("tabindex", "-1");
            } else {
                this.removeAttribute("aria-disabled");
                if (this.tabIndexBeforeDisable !== null) {
                    this.setAttribute("tabindex", this.tabIndexBeforeDisable);
                    this.tabIndexBeforeDisable = null;
                } else if (!this.hasAttribute("tabindex")) {
                    this.setAttribute("tabindex", "0");
                }
            }
        }
        if (name === 'value' && newValue) {
            requestAnimationFrame(() => {
                const matchingOption = this.options.find(option => option.value === newValue);
                if (matchingOption && !matchingOption.selected) {
                    this.select(matchingOption);
                }
            });
        }
    }


    /*** ----------------------------
     *  Form association
     * ----------------------------- */

    formResetCallback(): void {
        super.formResetCallback(); // Reset value and hasInteracted
        this.options.forEach(option => (option.selected = false));
        this.optionListManager.focusedElement = null;
    }

    formDisabledCallback(disabled: boolean): void {
        super.formDisabledCallback(disabled);
        // Additional listbox-specific disabled logic handled by base class
    }

    /**
     * Validates the listbox value.
     * Checks if required attribute is set and no value is selected.
     */
    protected updateValidity(): void {
        if (this.required && this.selectedValues.length === 0) {
            this.updateValidationState(
                { valueMissing: true },
                'Please select an option.'
            );
        } else {
            this.updateValidationState({}, '');
        }
    }



    /*** ----------------------------
     *  Selection Management
     * ----------------------------- */
    /**
     * Selects or toggles selection of a list box option.
     * In single-select mode, deselects all other options and selects the target option.
     * In multiple-select mode, toggles the selection state of the target option.
     * Dispatches m-listbox-select, m-listbox-unselected, and m-listbox-change events.
     * 
     * @param option - The option to select or toggle
     */
    select(option: MOption | null): void {
        if (!option) return;

        if (!this.options.includes(option)) {
            console.error('Attempted to select option not in this listbox', option);
            return;
        }

        if (option.disabled) {
            console.warn('Attempted to select disabled option', option);
            return;
        }
        this.optionListManager.select(option);
    }



    /*** ----------------------------
     *  Event Handlers
     * ----------------------------- */
    private handleKeydown = (event: KeyboardEvent) => {
        this.optionListManager.handleKeydown(event);
    };

    private handleFocus = () => {
        if (!this.optionListManager.focusedElement) this.focusFirst();
    };

    private handleBlur = () => {
        this.focusBlur();
    };

    private handleClick = (event: MouseEvent) => {
        const option = event
            .composedPath()
            .find(el => (el as HTMLElement).tagName === 'M-OPTION') as
            | MOption
            | undefined;

        if (option && !option.disabled) {
            if (!this.multiple) this.select(option);
            else {
                this.setFocus(option);
                this.select(option);
            }
        }
    };

    handleMouseOver = (event: MouseEvent) => {
        const option = event
            .composedPath()
            .find(el => (el as HTMLElement).tagName === 'M-OPTION') as
            | MOption
            | undefined;

        if (option && !option.disabled && this.optionListManager.focusedElement !== option) {
            this.setFocus(option);
        }
    };

    handleMouseOut = (event: MouseEvent) => {
        const option = event
            .composedPath()
            .find(el => (el as HTMLElement).tagName === 'M-OPTION') as
            | MOption
            | undefined;

        if (option && !option.disabled && this.optionListManager.focusedElement === option) {
            this.focusBlur();
        }
    };

}

export default MListbox;
