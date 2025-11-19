import { MInputListElement } from "../utils/m-input-list-element";
import { BindAttribute } from "../utils/reflect-attribute";
import { query } from "../utils/query";
import type { MOption } from "../m-option";
import { MListboxSelectEvent, MListboxUnselectedEvent, MListboxChangeEvent, MListboxFocusChangeEvent } from "./events";
import styles from "./index.css?inline";

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
 * @attr {boolean} multiple - Whether multiple items can be selected
 * 
 * @prop {string | string[] | null} value - The value of the first selected item (or array in multiple mode)
 * @prop {string[]} selectedValues - Array of all selected item values
 * @prop {MOption[]} selectedItems - Array of all selected item elements
 * @prop {boolean} multiple - Whether multiple selection is enabled
 * @prop {HTMLFormElement | null} form - The associated form element
 * @prop {string} name - The form control name
 * 
 * @event m-listbox-select - Fired when an item is selected. Detail: { item: MOption, selected: boolean }
 * @event m-listbox-unselected - Fired when an item is unselected. Detail: { item: MOption, selected: boolean }
 * @event m-listbox-change - Fired when the selection changes. Detail: { selected: string[] }
 * @event m-listbox-focus-change - Fired when focus moves to a different item. Detail: { item: MOption | null }
 * 
 */
export class MListbox extends MInputListElement {
    static tagName = 'm-listbox';
    static formAssociated = true;
    static observedAttributes = ['multiple', 'name', 'label', 'disabled', 'value', 'skip'];

    @BindAttribute()
    label?: string;

    @BindAttribute()
    multiple: boolean = false;

    @BindAttribute()
    name: string = '';

    @BindAttribute()
    skip?: string 

    @BindAttribute()
    disabled: boolean = false;

    private originalTabIndex: string | null = null;

    private internals: ElementInternals;

    /*** ----------------------------
     *  Getters 
     * ----------------------------- */

    /**
     * Returns the skip selector for filtering items in the list.
     */
    protected getItemsSkipSelector(): string | undefined {
        return this.skip;
    }

    /**
     * Hook called when focus changes to a new item.
     */
    protected onFocusChange(item: MOption | null): void {
        if (item) {
            this.dispatchEvent(new MListboxFocusChangeEvent({ item }));
        }
    }

    /**
     * Returns the associated form element, if any.
     */
    get form(): HTMLFormElement | null { return this.internals.form; }

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<slot></slot>`;
        shadow.adoptedStyleSheets = [baseStyleSheet];
        this.internals = this.attachInternals();
        if (!this.hasAttribute("tabindex")) {
            this.tabIndex = 0;
        }
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
        
        const valueAttr = this.getAttribute('value');
        if (valueAttr) {
            requestAnimationFrame(() => {
                const matchingItem = this.items.find(item => item.value === valueAttr);
                if (matchingItem && !matchingItem.selected) {
                    this.select(matchingItem);
                }
            });
        }
    }

    disconnectedCallback(): void {
        this.removeEventListener('keydown', this.handleKeydown);
        this.removeEventListener('focus', this.handleFocus, true);
        this.removeEventListener('blur', this.handleBlur, true);
        this.removeEventListener('click', this.handleClick);
        this.removeEventListener('mouseover', this.handleMouseOver);
        this.removeEventListener('mouseout', this.handleMouseOut);
    }


    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
        super.attributeChangedCallback(name, oldValue, newValue);

        if (name === 'label') {
            this.setAttribute("aria-label", newValue || "")
        }
        if (name === 'multiple') {
            this.items.forEach(item => (item.selected = false));
            this.focusedElement = null;
            this.updateFormValue();
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
                const matchingItem = this.items.find(item => item.value === newValue);
                if (matchingItem && !matchingItem.selected) {
                    this.select(matchingItem);
                }
            });
        }
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
            for (const val of this.selectedValues) formData.append(this.name, val);
            this.internals.setFormValue(formData);
        }
    }

    formAssociatedCallback(): void {
        this.updateFormValue();
    }

    formResetCallback(): void {
        this.items.forEach(item => (item.selected = false));
        this.focusedElement = null;
        this.updateFormValue();
    }

    formDisabledCallback(disabled: boolean): void {
        this.disabled = disabled;
    }



    /*** ----------------------------
     *  Selection Management
     * ----------------------------- */
    /**
     * Selects or toggles selection of a list box item.
     * In single-select mode, deselects all other items and selects the target item.
     * In multiple-select mode, toggles the selection state of the target item.
     * Dispatches m-listbox-select, m-listbox-unselected, and m-listbox-change events.
     * 
     * @param item - The item to select or toggle
     */
    select(item: MOption | null): void {
        if (!item) return;

        const result = this.computeSelection(item);

        result.itemsToDeselect.forEach(i => {
            i.selected = false;
            this.dispatchEvent(
                new MListboxUnselectedEvent({ item: i, selected: false })
            );
        });

        if (result.shouldToggle) {
            item.selected = !item.selected;
        } else {
            item.selected = true;
            if (result.newFocusTarget) {
                this.setFocus(result.newFocusTarget);
            }
        }

        const EventClass = item.selected ? MListboxSelectEvent : MListboxUnselectedEvent;
        this.dispatchEvent(
            new EventClass({ item, selected: item.selected! })
        );

        this.dispatchEvent(
            new MListboxChangeEvent({ selected: this.selectedValues })
        );

        this.dispatchEvent(new Event('change', { bubbles: true }));

        this.updateFormValue();
    }



    /*** ----------------------------
     *  Event Handlers
     * ----------------------------- */
    private handleKeydown = (event: KeyboardEvent) => {
        event.stopPropagation();
        if (!this.multiple) {
            // single-select: arrows select
            switch (event.key) {
                case 'ArrowDown':
                    this.selectNext();
                    event.preventDefault();
                    break;
                case 'ArrowUp':
                    this.selectPrev();
                    event.preventDefault();
                    break;
                case 'Home':
                    this.selectFirst();
                    event.preventDefault();
                    break;
                case 'End':
                    this.selectLast();
                    event.preventDefault();
                    break;
                case ' ':
                case 'Enter':
                    this.selectFocused();
                    event.preventDefault();
                    break;
            }
        } else {
            // multiple-select: arrows focus, shift+arrows extend selection
            switch (event.key) {
                case 'ArrowDown':
                    if (event.shiftKey) {
                        this.focusNext();
                        this.selectFocused();
                    } else {
                        this.focusNext();
                    }
                    event.preventDefault();
                    break;
                case 'ArrowUp':
                    if (event.shiftKey) {
                        this.focusPrev();
                        this.selectFocused();
                    } else {
                        this.focusPrev();
                    }
                    event.preventDefault();
                    break;
                case 'Home':
                    if (event.shiftKey) {
                        this.focusFirst();
                        this.selectFocused();
                    } else {
                        this.focusFirst();
                    }
                    event.preventDefault();
                    break;
                case 'End':
                    if (event.shiftKey) {
                        this.focusLast();
                        this.selectFocused();
                    } else {
                        this.focusLast();
                    }
                    event.preventDefault();
                    break;
                case ' ':
                case 'Enter':
                    this.selectFocused();
                    event.preventDefault();
                    break;
            }
        }
    };

    private handleFocus = () => {
        if (!this.focusedElement) this.focusFirst();
    };

    private handleBlur = () => {
        this.focusBlur();
    };

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


}

export default MListbox;
