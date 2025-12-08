import { MFormAssociatedElement } from "../utils/m-form-associated-element";
import { BindAttribute } from "../utils/reflect-attribute";
import { query } from "../utils/query";
import { OutsideClickController } from "../utils/outside-click-controller";
import { OptionListManager, type OptionLike, type SelectionResult, type SelectionMode } from "../utils/option-list-manager";
import styles from "./index.css?inline";
import MOption from "../m-option";
import { MComboboxSelectEvent, MComboboxUnselectedEvent, MComboboxChangeEvent, MComboboxFocusChangeEvent } from "./events";
import { autoUpdate, computePosition, flip, offset, size } from "@floating-ui/dom";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * A form-associated combobox built on m-listbox and m-search-list
 * 
 * @customElement
 * @tagname m-combobox
 * 
 * @slot - Default slot for m-option elements
 * @slot after - Content after the input element (icons, buttons)
 * 
 * @attr {string} name - The form control name
 * @attr {boolean} disabled - Whether the combobox is disabled
 * @attr {boolean} multiple - Whether multiple items can be selected
 * @attr {string} value - The value of the selected item (or comma-separated values in multiple mode)
 * @attr {string} label - Accessible label for the combobox
 * @attr {string} placeholder - Placeholder text for the input
 * @attr {boolean} clearable - Shows a clear button when input has value (default: true)
 * @attr {string} autocomplete - Autocomplete hint (e.g., email, username)
 * @attr {number} size - Visual width in characters
 * @attr {boolean} autofocus - Automatically focuses the input on page load
 * 
 * @prop {string | string[] | null} value - The value from the listbox
 * @prop {boolean} multiple - Whether multiple selection is enabled
 * @prop {HTMLFormElement | null} form - The associated form element
 * @prop {string} name - The form control name
 * 
 * @fires m-combobox-change - Fired when the selection changes
 */
export class MCombobox extends MFormAssociatedElement {
    static tagName = 'm-combobox';
    static formAssociated = true;
    static observedAttributes = [...MFormAssociatedElement.observedAttributes, 'multiple', 'debounce', 'placeholder', 'clearable', 'autocomplete', 'size', 'autofocus'];

    @BindAttribute()
    multiple: boolean = false;

    @BindAttribute()
    debounce: number = 150;

    @BindAttribute()
    placeholder?: string;

    @BindAttribute()
    clearable: boolean = true;

    @BindAttribute()
    autocomplete?: string;

    @BindAttribute()
    size?: number;

    @BindAttribute()
    autofocus: boolean = false;

    private _shadowRoot: ShadowRoot;
    private popoverCleanup?: () => void;
    private outsideClickController?: OutsideClickController;
    private optionListManager!: OptionListManager;

    @query('#popover')
    private popoverElement!: HTMLDivElement;

    @query('#multi-select-list')
    private multiSelectListElement!: HTMLDivElement;

    @query('m-input')
    private inputElement!: HTMLInputElement;

    @query('m-search-list')
    private searchListElement!: HTMLElement & { filter: (query: string) => void };

    /*** ----------------------------
     *  OptionListManager Setup
     * ----------------------------- */
    private createOptionListManager(): OptionListManager {
        // Build selector that excludes hidden, disabled, and non-matching items
        const baseSelector = "m-option:not([hidden]):not([disabled])";
        const skipSelector = "[data-match='false']"; // inline from getItemsSkipSelector
        const selector = `${baseSelector}:not(${skipSelector})`;

        // Combobox uses "single-focus" mode: arrow keys move focus only, Enter/Space selects
        const selectionMode: SelectionMode = this.multiple ? "multiple" : "single-focus";
        return new OptionListManager(
            this,
            selector,
            {
                selectCallback: (result: SelectionResult) => this.handleSelectCallback(result),
                focusCallback: (option: OptionLike) => this.handleFocusCallback(option)
            },
            selectionMode,
            { dom: "light" } // m-options are in light DOM
        );
    }

    /*** ----------------------------
     *  Property Getters
     * ----------------------------- */
    // Delegate to OptionListManager
    get options(): MOption[] {
        return this.optionListManager.options as MOption[];
    }

    get selectedOptions(): MOption[] {
        return this.optionListManager.selectedOptions as MOption[];
    }

    get selectedValues(): string[] {
        return this.optionListManager.selectedValues;
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

    // Provide focusedElement getter/setter for backward compatibility
    get focusedElement(): MOption | null {
        return this.optionListManager.focusedElement as MOption | null;
    }

    set focusedElement(el: MOption | null) {
        if (el) {
            this.optionListManager.focus(el);
        } else {
            this.optionListManager.focusBlur();
        }
    }

    constructor() {
        super();
        this._shadowRoot = this.attachShadow({ mode: 'open', delegatesFocus: true });
        this._shadowRoot.adoptedStyleSheets = [baseStyleSheet];
    }

    connectedCallback() {
        super.connectedCallback(); // Initialize form association
        
        this.render();

        // Initialize OptionListManager after DOM is ready
        this.optionListManager = this.createOptionListManager();

        this.setAttribute("role", "combobox");
        this.setAttribute("aria-haspopup", "listbox");
        this.setAttribute("aria-expanded", "false");
        this.setAttribute("aria-autocomplete", "list");

        if (this.popoverElement) {
            this.setAttribute("aria-controls", "popover");
        }

        if (!this.hasAttribute("tabindex")) {
            this.setAttribute("tabindex", "0");
        }

        if (this.label) {
            this.setAttribute("aria-label", this.label);
        }

        this.addEventListener("keydown", this.handleKeydown);
        this.addEventListener("input", this.handleInput);
        this.addEventListener("click", this.handleClick);
        this.addEventListener("mouseover", this.handleMouseOver);
        this.addEventListener("mouseout", this.handleMouseOut);
        this.addEventListener("m-option-selected-change", this.handleOptionSelectedChange);

        this.addEventListener("focus", this.handleFocus, true);
        this.addEventListener("blur", this.handleBlur, true);

        this.outsideClickController = new OutsideClickController(
            this,
            () => {
                if (this.popoverElement?.matches(':popover-open')) {
                    this.blur();
                }
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
                // Sync the input field to display the selected option(s)
                this.syncInputFromSelection();
            } else if (this.multiple) {
                // Initialize to empty array in multiple mode when nothing is selected
                this.value = [];
            }
        }

        // Update validity after initialization
        this.updateValidity();
    }

    disconnectedCallback() {
        super.disconnectedCallback(); // Clean up form association
        
        this.removeEventListener("keydown", this.handleKeydown);
        this.removeEventListener("input", this.handleInput);
        this.removeEventListener("click", this.handleClick);
        this.removeEventListener("mouseover", this.handleMouseOver);
        this.removeEventListener("mouseout", this.handleMouseOut);
        this.removeEventListener("m-option-selected-change", this.handleOptionSelectedChange);

        this.removeEventListener("focus", this.handleFocus, true);
        this.removeEventListener("blur", this.handleBlur, true);

        this.outsideClickController?.disconnect();
        this.popoverCleanup && this.popoverCleanup();
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (name === 'label') {
            if (newValue) {
                this.setAttribute("aria-label", newValue);
                // TODO: maybe this is not needed?
                if (this.inputElement) {
                    this.inputElement.setAttribute("label", newValue);
                }
            } else {
                this.removeAttribute("aria-label");
                // TODO: maybe this is not needed?
                if (this.inputElement) {
                    this.inputElement.removeAttribute("label");
                }
            }
        }
        
        // Forward input-related attributes to m-input element
        const inputForwardAttributes = ['placeholder', 'autocomplete', 'size', 'autofocus', 'clearable', 'disabled', 'readonly'];
        if (inputForwardAttributes.includes(name)) {
            if (this.inputElement) {
                if (newValue !== null) {
                    this.inputElement.setAttribute(name, newValue);
                } else {
                    this.inputElement.removeAttribute(name);
                }
            }
        }
        
        // Handle multiple attribute changes
        if (name === 'multiple' && this.optionListManager) {
            // Clear selections when toggling mode
            this.options.forEach(option => (option.selected = false));
            // Rebuild the manager with updated multiple setting
            this.optionListManager = this.createOptionListManager();
        }
    }

    /*** ----------------------------
     *  Popover Management
     * ----------------------------- */
    private updatePosition = () => {
        computePosition(this, this.popoverElement, {
            placement: 'bottom',
            middleware: [
                offset(6), flip(),
                size({
                    apply({ rects, availableHeight, elements }) {
                        // Change styles, e.g.
                        Object.assign(elements.floating.style, {
                            width: `${rects.reference.width}px`,
                            maxHeight: `min(${availableHeight}px, 300px)`,
                        });
                    },
                }),
            ],
        }).then(({ x, y }) => {
            Object.assign(this.popoverElement.style, {
                left: `${x}px`,
                top: `${y}px`,
            });
        });
    }
    private _showPopover(): void {
        if (!this.popoverElement) return;
        if (this.disabled) return; // Don't show popover when disabled
        this.popoverElement.showPopover();
        this.setAttribute("aria-expanded", "true");

        this.popoverCleanup = autoUpdate(
            this,
            this.popoverElement,
            this.updatePosition,
        );
    }

    private _hidePopover(): void {
        this.popoverElement?.hidePopover();
        this.popoverCleanup && this.popoverCleanup();
        this.focusBlur();
        this.setAttribute("aria-expanded", "false");
    }

    /*** ----------------------------
     *  OptionListManager Callbacks
     * ----------------------------- */
    private handleSelectCallback(result: SelectionResult): void {
        // Dispatch unselect events for deselected options
        result.itemsToDeselect.forEach(i => {
            this.dispatchEvent(
                new MComboboxUnselectedEvent({ option: i as MOption, selected: false })
            );
        });

        // Dispatch select or unselect event for the target option
        const option = result.itemToSelect as MOption;
        const EventClass = option.selected ? MComboboxSelectEvent : MComboboxUnselectedEvent;
        this.dispatchEvent(
            new EventClass({ option: option, selected: option.selected! })
        );

        // Get selected values once and reuse
        const selectedValues = this.optionListManager.selectedValues;
        
        // Dispatch change events
        this.dispatchEvent(
            new MComboboxChangeEvent({ selected: selectedValues })
        );
        this.dispatchEvent(new Event('change', { bubbles: true }));

        // Update form value via base class setter
        this.value = this.multiple ? selectedValues : (selectedValues[0] ?? null);
        
        // Sync input field with selection
        this.syncInputFromSelection();
        
        // Hide popover in single-select mode
        if (!this.multiple) {
            this._hidePopover();
        }
    }

    private handleFocusCallback(option: OptionLike): void {
        const mOption = option as MOption | null;
        
        if (!mOption) {
            this.removeAttribute("aria-activedescendant");
            this.dispatchEvent(new MComboboxFocusChangeEvent({ option: null }));
            return;
        }

        if (!mOption.id) {
            console.error('MOption missing required id attribute', mOption);
            return;
        }

        this.setAttribute("aria-activedescendant", mOption.id);
        this.dispatchEvent(new MComboboxFocusChangeEvent({ option: mOption }));
        
        // Combobox-specific: Open popover when an option is focused
        this._showPopover();
    }

    /*** ----------------------------
     *  Selection Management
     * ----------------------------- */
    private syncInputFromSelection(): void {
        if (this.multiple) {
            this.renderMultiselect();
        } else if (!this.multiple && this.selectedValues.length > 0) {
            this.inputElement.value = this.selectedOptions[0]?.textContent?.trim() || '';
        } else if (!this.multiple && this.selectedValues.length === 0) {
            this.inputElement.value = '';
        }
    }

    select(item: MOption): void {
        if (!item) return;
        
        if (!this.options.includes(item)) {
            console.error('Attempted to select option not in this combobox', item);
            return;
        }
        
        if (item.disabled) {
            console.warn('Attempted to select disabled option', item);
            return;
        }
        
        // Delegate to OptionListManager - callbacks will handle the rest
        this.optionListManager.select(item);
    }

    // Add these helper methods for consistency with m-listbox
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
     *  Form Lifecycle
     * ----------------------------- */
    override formResetCallback(): void {
        super.formResetCallback(); // Reset value and hasInteracted
        this.options.forEach(option => (option.selected = false));
        this.optionListManager.focusedElement = null;
        this.inputElement.value = '';
    }

    /**
     * Validates the combobox value.
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

    //  ------------------------------------------------------------------------
    //  Event Handlers
    //  ------------------------------------------------------------------------ 
    private handleOptionSelectedChange = (_e: Event) => {
        this.syncInputFromSelection();
    }

    private handleFocus = (_e: Event) => { this._showPopover(); }
    private handleBlur = (_e: Event) => {
        this.resetInputValue();
        this._hidePopover();
    }
    private handleInput = (_e: Event) => { this._showPopover(); }

    private handleClick = (event: MouseEvent) => {
        const item = event
            .composedPath()
            .find(el => (el as HTMLElement).tagName === 'M-OPTION') as
            | MOption
            | undefined;

        if (item && !item.disabled) {
            if (!this.multiple) {this.select(item);}
            else {
                this.setFocus(item);
                this.select(item);
            }
        }
    };

    private handleMouseOver = (event: MouseEvent) => {
        const option = event
            .composedPath()
            .find(el => (el as HTMLElement).tagName === 'M-OPTION') as
            | MOption
            | undefined;

        if (option && !option.disabled && this.optionListManager.focusedElement !== option) {
            this.setFocus(option);
        }
    };

    private handleMouseOut = (event: MouseEvent) => {
        const option = event
            .composedPath()
            .find(el => (el as HTMLElement).tagName === 'M-OPTION') as
            | MOption
            | undefined;

        if (option && !option.disabled && this.optionListManager.focusedElement === option) {
            this.focusBlur();
        }
    };

    private handleKeydown = (e: Event) => {
        if (this.disabled) return;
        const event = e as KeyboardEvent;
        
        // Combobox-specific: Escape key closes popover
        if (event.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (this.popoverElement.matches(':popover-open')) {
                this.resetInputValue();
                this._hidePopover();
            }
            return;
        }
        
        // Delegate to OptionListManager for standard keyboard handling
        // This handles: ArrowUp, ArrowDown, Home, End, Space, Enter, Ctrl+N, Ctrl+P
        // The popover will open automatically via the focus callback when an option is focused
        this.optionListManager.handleKeydown(event);
    }

    private resetInputValue() {
        const newValue = this.multiple 
            ? "" 
            : (this.selectedOptions[0]?.textContent || "");
        
        this.inputElement.value = newValue;
        
        // Update m-search-list filtering to match the new input value
        if (this.searchListElement) {
            this.searchListElement.filter();
        }
    }



    private renderMultiselect() {
        this.multiSelectListElement.innerHTML = this.selectedOptions.reduce((acc, i) => {
            return `${acc}<li>${i.textContent.trim()}</li>`
        }, "")
    }

    private render() {
        this._shadowRoot.innerHTML = `
            <m-search-list debounce="${this.debounce}" target="#popover slot">
                <m-input 
                    type="text" 
                    ${this.label ? `label="${this.label}"` : ''}
                    ${this.placeholder ? `placeholder="${this.placeholder}"` : ''}
                    ${this.clearable ? 'clearable' : ''}
                    ${this.autocomplete ? `autocomplete="${this.autocomplete}"` : ''}
                    ${this.size != null ? `size="${this.size}"` : ''}
                    ${this.autofocus ? 'autofocus' : ''}
                    ${this.disabled ? 'disabled' : ''}
                    ${this.readonly ? 'readonly' : ''}
                >
                    <ul slot="before" id="multi-select-list"></ul>
                    <slot name="after" slot="after"></slot>
                </m-input>

                <div 
                    id="popover"
                    class="box"
                    role="listbox"
                    tabindex="-1"
                    popover="manual"
                    ${this.multiple ? 'aria-multiselectable="true"' : ''}
                >
                    <slot></slot>
                </div>
            
            </m-search-list>
        `;
    }
}

export default MCombobox;
