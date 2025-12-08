import { MFormAssociatedElement } from "../utils/m-form-associated-element";
import { BindAttribute } from "../utils/reflect-attribute";
import { OutsideClickController } from "../utils/outside-click-controller";
import type { MOption } from "../m-option";
import { MListboxSelectEvent, MListboxUnselectedEvent, MListboxChangeEvent, MListboxFocusChangeEvent } from "./events";
import styles from "./index.css?inline";
import { OptionListManager, type OptionLike, type SelectionResult } from "../utils/option-list-manager";

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
 * @attr {string} name - The form control name
 * @attr {boolean} multiple - Whether multiple options can be selected
 * 
 * @prop {string | string[] | null} value - The value of the first selected option (or array in multiple mode)
 * @prop {string[]} selectedValues - Array of all selected option values
 * @prop {MOption[]} selectedOptions - Array of all selected option elements
 * @prop {boolean} multiple - Whether multiple selection is enabled
 * @prop {HTMLFormElement | null} form - The associated form element
 * @prop {string} name - The form control name
 * 
 * @event m-listbox-select - Fired when an option is selected. Detail: { item: MOption, selected: boolean }
 * @event m-listbox-unselected - Fired when an option is unselected. Detail: { item: MOption, selected: boolean }
 * @event m-listbox-change - Fired when the selection changes. Detail: { selected: string[] }
 * @event m-listbox-focus-change - Fired when focus moves to a different option. Detail: { item: MOption | null }
 * 
 */
export class MListbox extends MFormAssociatedElement {
    static tagName = 'm-listbox';
    static formAssociated = true;
    static observedAttributes = [...MFormAssociatedElement.observedAttributes, 'multiple', 'skip'];

    @BindAttribute()
    multiple: boolean = false;

    @BindAttribute()
    skip?: string;

    private originalTabIndex: string | null = null;

    private outsideClickController?: OutsideClickController;
    private optionListManager!: OptionListManager;
    // Note: this.internals is inherited from MFormAssociatedElement

    /*** ----------------------------
     *  Getters 
     * ----------------------------- */
    /**
     * Returns all available options (from OptionListManager).
     */
    get options(): MOption[] {
        return this.optionListManager.options as MOption[];
    }

    /**
     * Returns all selected options (from OptionListManager).
     */
    get selectedOptions(): MOption[] {
        return this.optionListManager.selectedOptions as MOption[];
    }

    /**
     * Returns values of all selected options (from OptionListManager).
     */
    get selectedValues(): string[] {
        return this.optionListManager.selectedValues;
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

        return new OptionListManager(
            this,
            selector,
            {
                selectCallback: (result: SelectionResult) => this.handleSelectCallback(result),
                focusCallback: (option: OptionLike) => this.handleFocusCallback(option)
            },
            this.multiple,
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

        // Dispatch change events
        this.dispatchEvent(
            new MListboxChangeEvent({ selected: this.optionListManager.selectedValues })
        );
        this.dispatchEvent(new Event('change', { bubbles: true }));

        // Update form value via base class setter
        this.value = this.multiple ? this.selectedValues : (this.selectedValues[0] ?? null);
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
    setFocus(option: MOption | null): void {
        if (!option) return;
        this.optionListManager.focus(option);
    }

    focusFirst(): void {
        this.optionListManager.focusFirst();
    }

    focusLast(): void {
        this.optionListManager.focusLast();
    }

    focusNext(): void {
        this.optionListManager.focusNext();
    }

    focusPrev(): void {
        this.optionListManager.focusPrev();
    }

    focusBlur(): void {
        this.optionListManager.focusBlur();
    }

    /*** ----------------------------
     *  Selection Management - Delegated to OptionListManager
     * ----------------------------- */
    selectFocused(): void {
        this.optionListManager.selectFocused();
    }

    selectFirst(): void {
        this.optionListManager.selectFirst();
    }

    selectLast(): void {
        this.optionListManager.selectLast();
    }

    selectNext(): void {
        this.optionListManager.selectNext();
    }

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
            this.originalTabIndex = this.getAttribute("tabindex");
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
            this.optionListManager.multiple = this.multiple;
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
                this.originalTabIndex = this.getAttribute("tabindex");
                this.setAttribute("tabindex", "-1");
            } else {
                this.removeAttribute("aria-disabled");
                if (this.originalTabIndex !== null) {
                    this.setAttribute("tabindex", this.originalTabIndex);
                    this.originalTabIndex = null;
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
