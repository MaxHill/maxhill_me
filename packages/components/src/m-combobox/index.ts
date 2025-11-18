import { MElement } from "../utils/m-element";
import { BindAttribute } from "../utils/reflect-attribute";
import { query } from "../utils/query";
import styles from "./index.css?inline";
import MInput from "../m-input";
import MOption from "../m-option";
import { 
  getItems, 
  getSelectedItems, 
  getSelectedValues, 
  focusNext, 
  focusPrev,
  focusFirst,
  computeSelection, 
  focusLast
} from "../utils/list-options-manager";

const baseStyleSheet = new CSSStyleSheet();
baseStyleSheet.replaceSync(styles);

/**
 * A form-associated combobox built on m-listbox and m-search-list
 * 
 * @customElement
 * @tagname m-combobox
 * 
 * @slot - Default slot for m-option elements
 * 
 * @attr {string} name - The form control name
 * @attr {boolean} disabled - Whether the combobox is disabled
 * @attr {boolean} multiple - Whether multiple items can be selected
 * @attr {string} value - The value of the selected item (or comma-separated values in multiple mode)
 * @attr {string} label - Accessible label for the combobox
 * 
 * @prop {string | string[] | null} value - The value from the listbox
 * @prop {boolean} multiple - Whether multiple selection is enabled
 * @prop {HTMLFormElement | null} form - The associated form element
 * @prop {string} name - The form control name
 * 
 * @fires m-combobox-change - Fired when the selection changes
 */
export class MCombobox extends MElement {
    static tagName = 'm-combobox';
    static formAssociated = true;
    static observedAttributes = ['name', 'disabled', 'multiple', 'value', 'label'];

    @BindAttribute()
    name: string = '';

    @BindAttribute()
    disabled: boolean = false;

    @BindAttribute()
    multiple: boolean = false;

    @BindAttribute()
    label?: string;

    private _shadowRoot: ShadowRoot;
    private internals: ElementInternals;

    @query('#popover')
    private popoverElement!: HTMLDivElement;

    @query('#multi-select-list')
    private multiSelectListElement!: HTMLDivElement;

    @query('m-input')
    private inputElement!: MInput;

    private _focusedElement: MOption | null = null;
    set focusedElement(el: MOption | null) {
        if (this._focusedElement) {
            this._focusedElement.focused = false;
        }
        
        this._focusedElement = el;
        
        if (el) {
            el.focused = true;
            this.setAttribute("aria-activedescendant", el.id);
        } else {
            this.removeAttribute("aria-activedescendant");
        }
    }

    get focusedElement() { return this._focusedElement; }

    private get items() { 
        return getItems<MOption>(
            this,
            "[data-match='false']"
        ); 
    }

    get selectedItems(): MOption[] { 
        return getSelectedItems(this.items); 
    }

    get selectedValues(): string[] { 
        return getSelectedValues(this.items); 
    }

    get value(): string | string[] | null {
        if (this.multiple) return this.selectedValues;
        return this.selectedItems[0]?.value ?? null;
    }

    get form(): HTMLFormElement | null {
        return this.internals.form;
    }

    constructor() {
        super();
        this._shadowRoot = this.attachShadow({ mode: 'open' });
        this._shadowRoot.adoptedStyleSheets = [baseStyleSheet];
        this.internals = this.attachInternals();
    }

    connectedCallback() {
        this.render();

        this.setAttribute("role", "combobox");
        this.setAttribute("aria-haspopup", "listbox");
        this.setAttribute("aria-expanded", "false");
        
        if (this.popoverElement) {
            this.setAttribute("aria-controls", "popover");
        }
        
        if (!this.hasAttribute("tabindex")) {
            this.setAttribute("tabindex", "0");
        }

        this.addEventListener("keydown", this.handleKeydown);
        this.addEventListener("input", this.handleInput);
        this.addEventListener("click", this.handleClick);
        this.addEventListener("mouseover", this.handleMouseOver);
        this.addEventListener("mouseout", this.handleMouseOut);

        this.addEventListener("focus", this.handleFocus, true);
        this.addEventListener("blur", this.handleBlur, true);
    }

    disconnectedCallback() {
        this.removeEventListener("keydown", this.handleKeydown);
        this.removeEventListener("input", this.handleInput);
        this.removeEventListener("click", this.handleClick);
        this.removeEventListener("mouseover", this.handleMouseOver);
        this.removeEventListener("mouseout", this.handleMouseOut);

        this.removeEventListener("focus", this.handleFocus, true);
        this.removeEventListener("blur", this.handleBlur, true);
    }

    /*** ----------------------------
     *  Popover Management
     * ----------------------------- */
    private _showPopover(): void {
        this.popoverElement?.showPopover();
        this.setAttribute("aria-expanded", "true");
    }

    private _hidePopover(): void {
        this.popoverElement?.hidePopover();
        this.setAttribute("aria-expanded", "false");
    }

    /*** ----------------------------
     *  Focus Management
     * ----------------------------- */
    /**
     * Sets focus to a specific list box item.
     * Removes focus from the previously focused item and dispatches a focus-change event.
     * 
     * @param item - The item to focus, or null to clear focus
     */
    setFocus(item: MOption | null): void {
        if (!item) return;
        if (this.focusedElement) this.focusedElement.removeAttribute('focused');

        item.focused = true
        this.focusedElement = item;

        // TODO: Add event here
        // this.dispatchEvent(
            // new MComboboxFocusChangeEvent({ item })
        // );
    }

    /**
     * Moves focus to the first item in the list.
     */
    focusFirst(): void {
        this.setFocus(focusFirst(this.items));
    }

    /**
     * Moves focus to the last item in the list.
     */
    focusLast(): void {
        this.setFocus(focusLast(this.items));
    }

    /**
     * Moves focus to the next item in the list.
     * Wraps around to the first item if at the end.
     */
    focusNext(): void {
        const next =focusNext(this.items, this.focusedElement);
        this.setFocus(next);
    }

    /**
     * Moves focus to the previous item in the list.
     * Wraps around to the last item if at the beginning.
     */
    focusPrev(): void {
        this.setFocus(focusPrev(this.items, this.focusedElement));
    }

    /**
     * Clears focus from the currently focused item.
     */
    focusBlur(): void {
        if (this.focusedElement) {
            this.focusedElement.removeAttribute('focused');
            this.focusedElement = null;
        }
    }


    /*** ----------------------------
     *  Selection Management
     * ----------------------------- */
    private select(item: MOption): void {
        if (!item) return;

        const result = computeSelection(
            item,
            this.items,
            this.selectedItems,
            this.focusedElement,
            { multiple: this.multiple }
        );

        result.itemsToDeselect.forEach(i => {
            i.selected = false;
            // TODO: send event
            // this.dispatchEvent(
            //     new MListboxUnselectedEvent({ item: i, selected: false })
            // );
        });

        if (result.shouldToggle) {
            item.selected = !item.selected;
        } else {
            item.selected = true;
            if (result.newFocusTarget) {
                this.setFocus(result.newFocusTarget);
            }
        }

        // TODO: extract to own method
        if (this.multiple) {
            // this.multiSelectListElement.textContent = item.textContent?.trim() || '';
            this.renderMultiselect();
        } else if (!this.multiple && this.selectedValues.length > 0) {
            this.inputElement.value = item.textContent?.trim() || '';
        } else if (!this.multiple && result.itemsToDeselect.length > 0) {
            this.inputElement.value = '';
        }
        this._hidePopover();

        // TODO: update events
        // const EventClass = item.selected ? MListboxSelectEvent : MListboxUnselectedEvent;
        this.dispatchEvent(
            new CustomEvent('m-combobox-change', {
                detail: { selected: this.selectedValues },
                bubbles: true,
                composed: true
            })
        );

        this.updateFormValue();
    }

    /**
     * Selects the currently focused item.
     */
    selectFocused(): void {
        if (this.focusedElement) this.select(this.focusedElement);
    }

    /**
     * Selects the first item in the list.
     */
    selectFirst(): void {
        const first = focusFirst(this.items);
        if (first) this.select(first);
    }

    /**
     * Selects the last item in the list.
     */
    selectLast(): void {
        const last = focusLast(this.items);
        if (last) this.select(last);
    }

    /**
     * Selects the next item in the list.
     * Wraps around to the first item if at the end.
     */
    selectNext(): void {
        const next = focusNext(this.items, this.focusedElement);
        if (next) this.select(next);
    }

    /**
     * Selects the previous item in the list.
     * Wraps around to the last item if at the beginning.
     */
    selectPrev(): void {
        const prev = focusPrev(this.items, this.focusedElement);
        if (prev) this.select(prev);
    }


    /*** ----------------------------
     *  Form association
     * ----------------------------- */
    private updateFormValue(): void {
        if (this.selectedValues.length === 0) {
            this.internals.setFormValue(null);
        } else if (this.selectedValues.length === 1) {
            this.internals.setFormValue(this.selectedValues[0]);
        } else {
            const formData = new FormData();
            for (const val of this.selectedValues) { formData.append(this.name, val); }
            this.internals.setFormValue(formData);
        }
    }

    formAssociatedCallback(): void {
        this.updateFormValue();
    }

    formResetCallback(): void {
        this.items.forEach(item => (item.selected = false));
        this.focusedElement = null;
        this.inputElement.value = '';
        this.updateFormValue();
    }

    formDisabledCallback(disabled: boolean): void {
        this.disabled = disabled;
    }

    formStateRestoreCallback(state: string | FormData | null): void {
        if (state === null) {
            this.formResetCallback();
        } else if (typeof state === 'string') {
            const option = this.items.find(item => item.value === state);
            if (option) {
                option.selected = true;
                this.updateFormValue();
            }
        }
    }

    //  ------------------------------------------------------------------------
    //  Event Handlers
    //  ------------------------------------------------------------------------ 
    private handleFocus = (_e: Event) => { this._showPopover(); }
    private handleBlur = (_e: Event) => { this._hidePopover(); }
    private handleInput = (_e: Event) => {this._showPopover(); }

    private handleClick = (event: MouseEvent) => {
        const item = event
            .composedPath()
            .find(el => (el as HTMLElement).tagName === 'M-OPTION') as
            | MOption
            | undefined;

        if (item && !item.disabled) {
            if (!this.multiple) this.select(item);
            else {
                this.setFocus(item);
                this.select(item);
            }
        }
    };

    private handleMouseOver = (event: MouseEvent) => {
        const item = event
            .composedPath()
            .find(el => (el as HTMLElement).tagName === 'M-OPTION') as
            | MOption
            | undefined;

        if (item && !item.disabled && this.focusedElement !== item) {
            this.setFocus(item);
        }
    };

    private handleMouseOut = (event: MouseEvent) => {
        const item = event
            .composedPath()
            .find(el => (el as HTMLElement).tagName === 'M-OPTION') as
            | MOption
            | undefined;

        if (item && !item.disabled && this.focusedElement === item) {
            this.focusBlur();
        }
    };

    private handleKeydown = (e: Event) => {
        const event = e as KeyboardEvent;
        
        if (
            event.key === "ArrowDown" ||
            (event.key === "n" && event.ctrlKey)
        ) {
            e.preventDefault();
            e.stopPropagation();
            this._showPopover(); 
            this.focusNext();
        } else if (
            event.key === "ArrowUp" ||
            (event.key === "p" && event.ctrlKey)
        ) {
            e.preventDefault();
            e.stopPropagation();
            this._showPopover(); 
            this.focusPrev();
        } else if (event.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (this.focusedElement) {
                this.selectFocused();
            }
        } else if (event.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (this.popoverElement.matches(':popover-open')) {
                this._hidePopover();
            }
        }
    }

    private renderMultiselect() {
        this.multiSelectListElement.innerHTML = this.selectedItems.reduce((acc, i) => {
            return `${acc}<li>${i.textContent.trim()}</li>`
        },"")
    }

    private render() {
        this._shadowRoot.innerHTML = `
            <m-search-list target="#popover slot">
                <div slot="controller" id="multi-select-list" slot="control"></div>
                <m-input type="text" role="combobox"></m-input>

                <div 
                    id="popover"
                    class="box"
                    role="listbox"
                    tabindex="-1"
                    popover="manual"
                    ${this.multiple ? 'aria-multiselectable="true"' : ''}
                    ${this.label ? `aria-label="${this.label}"` : ''}
                >
                    <slot></slot>
                </div>
            
            </m-search-list>
        `;
    }
}

export default MCombobox;
