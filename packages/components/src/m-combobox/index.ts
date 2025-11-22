import { MInputListElement } from "../utils/m-input-list-element";
import { BindAttribute } from "../utils/reflect-attribute";
import { query } from "../utils/query";
import styles from "./index.css?inline";
import MInput from "../m-input";
import MOption from "../m-option";
import { MOptionSelectedChangeEvent } from "../m-option/events";
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
export class MCombobox extends MInputListElement {
    static tagName = 'm-combobox';
    static formAssociated = true;
    static observedAttributes = ['name', 'disabled', 'multiple', 'value', 'label', 'debounce'];

    @BindAttribute()
    name: string = '';

    @BindAttribute()
    disabled: boolean = false;

    @BindAttribute()
    multiple: boolean = false;

    @BindAttribute()
    label: string = "";

    @BindAttribute()
    debounce: number = 150;

    private _shadowRoot: ShadowRoot;
    private internals: ElementInternals;
    private popoverCleanup?: () => void;

    @query('#popover')
    private popoverElement!: HTMLDivElement;

    @query('#multi-select-list')
    private multiSelectListElement!: HTMLDivElement;

    @query('input')
    private inputElement!: HTMLInputElement;

    protected getItemsSkipSelector(): string {
        return "[data-match='false']";
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
    }

    disconnectedCallback() {
        this.removeEventListener("keydown", this.handleKeydown);
        this.removeEventListener("input", this.handleInput);
        this.removeEventListener("click", this.handleClick);
        this.removeEventListener("mouseover", this.handleMouseOver);
        this.removeEventListener("mouseout", this.handleMouseOut);
        this.removeEventListener("m-option-selected-change", this.handleOptionSelectedChange);

        this.removeEventListener("focus", this.handleFocus, true);
        this.removeEventListener("blur", this.handleBlur, true);

        this.popoverCleanup && this.popoverCleanup();
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (name === 'label') {
            if (newValue) {
                this.setAttribute("aria-label", newValue);
                if (this.inputElement) {
                    this.inputElement.setAttribute("label", newValue);
                }
            } else {
                this.removeAttribute("aria-label");
                if (this.inputElement) {
                    this.inputElement.removeAttribute("label");
                }
            }
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
                            maxHeight: `${Math.max(0, availableHeight)}px`,
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
        this.popoverElement?.showPopover();
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
     *  Selection Management
     * ----------------------------- */
    private syncInputFromSelection(): void {
        console.log("sync input", this.multiple, this.selectedValues.length, this.selectedValues, this.selectedItems, )
        if (this.multiple) {
            this.renderMultiselect();
        } else if (!this.multiple && this.selectedValues.length > 0) {
            console.log("set input value to: ",this.selectedItems[0]?.textContent?.trim() )
            this.inputElement.value = this.selectedItems[0]?.textContent?.trim() || '';
        } else if (!this.multiple && this.selectedValues.length === 0) {
            console.log("set input value to empty");
            this.inputElement.value = '';
        }
    }

    select(item: MOption): void {
        if (!item) return;

        const result = this.computeSelection(item);

        result.itemsToDeselect.forEach((i: MOption) => {
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

        console.log("select", this.selectedValues)
        this.syncInputFromSelection();
        if (!this.multiple) {
            this._hidePopover();
        }

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
    private handleOptionSelectedChange = (_e: Event) => {
        console.log("option change callback", this.selectedValues)
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

    private handleKeydown = (e: Event) => {
        if (this.disabled) return;
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
        } else if (event.key === "Home") {
            this.focusFirst();
            event.preventDefault();
        } else if (event.key === "End") {
            this.focusLast();
            event.preventDefault();
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
                this.resetInputValue();
                this._hidePopover();
            }
        }
    }

    private resetInputValue() {
        if (this.multiple) {
            this.inputElement.value = "";
        } else {
            this.inputElement.value = this.selectedItems[0]?.textContent || "";
        }
    }



    private renderMultiselect() {
        this.multiSelectListElement.innerHTML = this.selectedItems.reduce((acc, i) => {
            return `${acc}<li>${i.textContent.trim()}</li>`
        }, "")
    }

    private render() {
        this._shadowRoot.innerHTML = `
            <m-search-list debounce="${this.debounce}" target="#popover slot">
                <div slot="controller" id="multi-select-list" slot="control"></div>
                <input type="text" ${this.label ? `label="${this.label}"` : ''}></input>

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
